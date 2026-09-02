const crypto = require('crypto');
const fsp = require('fs/promises');
const path = require('path');
const zlib = require('zlib');

const { Harness } = require('./luxcloudHarness');

const h = new Harness();

function sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

function blobPath(hash) {
    return path.join(process.env.LUXCLOUD_FS_ROOT, 'blobs', hash.slice(0, 2), hash.slice(2, 4), hash);
}

async function exists(file) {
    try {
        await fsp.access(file);
        return true;
    } catch {
        return false;
    }
}

async function main() {
    await h.start();

    const { addRefs, removeRefsForRevision, enqueueOrphans } = require('../cloudBlobs');
    const { runGc, runReconcile, getGcStatus } = require('../jobs/cloudGc');

    const userA = await h.createUser({ googleId: 'g-a', username: 'beatv' });
    const userB = await h.createUser({ googleId: 'g-b', username: 'otheruser' });
    const admin = await h.createUser({ googleId: 'g-adm', username: 'root' });
    await h.pool.query('UPDATE users SET role = ? WHERE id = ?', ['admin', admin]);

    const sessionA = { id: userA, username: 'beatv', role: 'user', banned: false };
    const sessionB = { id: userB, username: 'otheruser', role: 'user', banned: false };

    const A = (await h.authorizeDevice({ user: sessionA, deviceUuid: 'dev-aaaa-0001' })).accessToken;
    const B = (await h.authorizeDevice({ user: sessionB, deviceUuid: 'dev-bbbb-0001', platform: 'linux' })).accessToken;

    let res;

    h.section('1) Upload');

    const payload = Buffer.from('hello lux cloud, this is a config file\n'.repeat(20));
    const hash = sha256(payload);

    res = await h.request({
        method: 'PUT', url: `/api/cloud/blobs/${hash}`, token: A, body: payload,
        headers: { 'Content-Type': 'application/octet-stream' }
    });
    h.check('Upload -> 201', res.status === 201 && res.body.hash === hash, res.body);
    h.check('Antwort nennt Original- und Speichergroesse',
        res.body.size === payload.length && res.body.storedSize === payload.length, res.body);
    h.check('Blob liegt im Objektspeicher', await exists(blobPath(hash)));

    const [blobRows] = await h.pool.query('SELECT * FROM blobs WHERE hash = ?', [hash]);
    h.check('blobs-Zeile angelegt, refcount 0',
        blobRows.length === 1 && Number(blobRows[0].refcount) === 0, blobRows[0]);
    h.check('storage_key folgt dem Layout aus Abschnitt E.2',
        blobRows[0].storage_key === `blobs/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}`,
        blobRows[0].storage_key);

    res = await h.request({
        method: 'PUT', url: `/api/cloud/blobs/${hash}`, token: A, body: payload,
        headers: { 'Content-Type': 'application/octet-stream' }
    });
    h.check('zweiter Upload desselben Blobs -> 409 already_exists',
        res.status === 409 && res.body.error === 'already_exists', res.body);

    const wrongHash = sha256(Buffer.from('etwas ganz anderes'));
    res = await h.request({
        method: 'PUT', url: `/api/cloud/blobs/${wrongHash}`, token: A, body: payload,
        headers: { 'Content-Type': 'application/octet-stream' }
    });
    h.check('falscher Hash -> 400 hash_mismatch',
        res.status === 400 && res.body.error === 'hash_mismatch', res.body);
    h.check('nach hash_mismatch liegt nichts im Speicher', !(await exists(blobPath(wrongHash))));

    res = await h.request({ method: 'PUT', url: '/api/cloud/blobs/nichthex', token: A, body: payload });
    h.check('kaputter Hash -> 400', res.status === 400, res.body);

    res = await h.request({
        method: 'PUT', url: `/api/cloud/blobs/${sha256(Buffer.from('x'))}`, token: A, body: Buffer.from('x'),
        headers: { 'X-Lux-Compression': 'brotli' }
    });
    h.check('unbekannte Kompression -> 400', res.status === 400, res.body);

    h.section('2) Deduplizierung ueber Konten hinweg');

    res = await h.request({
        method: 'PUT', url: `/api/cloud/blobs/${hash}`, token: B, body: payload,
        headers: { 'Content-Type': 'application/octet-stream' }
    });
    h.check('User B laedt dieselbe Datei -> already_exists, kein zweites Objekt',
        res.status === 409 && res.body.error === 'already_exists', res.body);

    const [afterDedup] = await h.pool.query('SELECT COUNT(*) AS count FROM blobs WHERE hash = ?', [hash]);
    h.check('weiterhin genau eine blobs-Zeile', Number(afterDedup[0].count) === 1, afterDedup[0]);

    const [claims] = await h.pool.query('SELECT user_id FROM blob_upload_claims WHERE blob_hash = ?', [hash]);
    h.check('beide Konten haben einen Upload-Anspruch', claims.length === 2, claims);

    h.section('3) Download und Zugriffskontrolle');

    res = await h.request({ url: `/api/cloud/blobs/${hash}`, token: A, raw: true });
    h.check('Download -> 200 mit byte-genauem Inhalt',
        res.status === 200 && Buffer.compare(res.body, payload) === 0, res.status);
    h.check('Download setzt nosniff und attachment',
        res.headers['x-content-type-options'] === 'nosniff'
        && res.headers['content-disposition'] === 'attachment', res.headers);
    h.check('Download meldet die Kompression', res.headers['x-lux-compression'] === 'none', res.headers);

    const strangerHash = sha256(Buffer.from('nur user C kennt das'));
    await h.pool.query(
        'INSERT INTO blobs (hash, size, stored_size, compression, storage_key) VALUES (?, ?, ?, ?, ?) RETURNING hash',
        [strangerHash, 10, 10, 'none', `blobs/${strangerHash.slice(0, 2)}/${strangerHash.slice(2, 4)}/${strangerHash}`]
    );

    res = await h.request({ url: `/api/cloud/blobs/${strangerHash}`, token: A });
    h.check('fremder Blob-Hash -> 404, obwohl er existiert',
        res.status === 404 && res.body.error === 'not_found', res.body);

    res = await h.request({ url: `/api/cloud/blobs/${strangerHash}/head`, token: A });
    h.check('auch head verraet den fremden Blob nicht', res.status === 404, res.body);

    res = await h.request({ url: `/api/cloud/blobs/${hash}` });
    h.check('Download ohne Token -> 401', res.status === 401, res.body);

    await h.pool.query(
        `UPDATE blob_upload_claims SET created_at = NOW() - INTERVAL '48 hours'
          WHERE blob_hash = ? AND user_id = ?`,
        [hash, userB]
    );
    res = await h.request({ url: `/api/cloud/blobs/${hash}`, token: B });
    h.check('abgelaufener Upload-Anspruch reicht nicht mehr -> 404', res.status === 404, res.body);

    res = await h.request({ url: `/api/cloud/blobs/${hash}/head`, token: A });
    h.check('head des eigenen Blobs -> 200',
        res.status === 200 && res.body.size === payload.length, res.body);

    h.section('4) Fortsetzbarer Upload');

    const big = crypto.randomBytes(64 * 1024);
    const bigHash = sha256(big);
    const half = Math.floor(big.length / 2);

    res = await h.request({
        method: 'PUT', url: `/api/cloud/blobs/${bigHash}`, token: A, body: big.subarray(0, half),
        headers: { 'Content-Range': `bytes 0-${half - 1}/${big.length}` }
    });
    h.check('erste Haelfte -> 202 mit receivedBytes',
        res.status === 202 && res.body.receivedBytes === half, res.body);

    res = await h.request({
        method: 'PUT', url: `/api/cloud/blobs/${bigHash}`, token: A, body: big.subarray(0, half),
        headers: { 'Content-Range': `bytes 0-${half - 1}/${big.length}` }
    });
    h.check('falscher Offset -> 409 range_mismatch mit dem richtigen Offset',
        res.status === 409 && res.body.error === 'range_mismatch' && res.body.receivedBytes === half, res.body);

    res = await h.request({
        method: 'PUT', url: `/api/cloud/blobs/${bigHash}`, token: A, body: big.subarray(half),
        headers: { 'Content-Range': `bytes ${half}-${big.length - 1}/${big.length}` }
    });
    h.check('zweite Haelfte -> 201', res.status === 201 && res.body.size === big.length, res.body);

    res = await h.request({ url: `/api/cloud/blobs/${bigHash}`, token: A, raw: true });
    h.check('fortgesetzter Upload ist byte-genau', Buffer.compare(res.body, big) === 0);

    res = await h.request({
        method: 'PUT', url: `/api/cloud/blobs/${sha256(Buffer.from('y'))}`, token: A, body: Buffer.from('y'),
        headers: { 'Content-Range': 'bytes kaputt' }
    });
    h.check('kaputtes Content-Range -> 400', res.status === 400, res.body);

    h.section('5) Kompression');

    const text = Buffer.from(JSON.stringify({ setting: 'value' }).repeat(200));
    const textHash = sha256(text);
    const compressed = zlib.zstdCompressSync(text);

    res = await h.request({
        method: 'PUT', url: `/api/cloud/blobs/${textHash}`, token: A, body: compressed,
        headers: { 'X-Lux-Compression': 'zstd' }
    });
    h.check('zstd-Upload wird gegen den Hash des Originals geprueft',
        res.status === 201 && res.body.size === text.length, res.body);
    h.check('gespeichert wird die kleinere, komprimierte Fassung',
        res.body.storedSize < text.length, { stored: res.body.storedSize, original: text.length });

    res = await h.request({
        method: 'PUT', url: `/api/cloud/blobs/${sha256(Buffer.from('nicht wirklich zstd'))}`, token: A,
        body: Buffer.from('nicht wirklich zstd'), headers: { 'X-Lux-Compression': 'zstd' }
    });
    h.check('als zstd deklarierter Mist -> hash_mismatch',
        res.status === 400 && res.body.error === 'hash_mismatch', res.body);

    h.section('6) Batch');

    const small = [1, 2, 3].map((n) => Buffer.from(`kleine datei ${n}`));
    res = await h.request({
        method: 'POST', url: '/api/cloud/blobs/batch', token: A,
        body: {
            blobs: small.map((buf) => ({ hash: sha256(buf), compression: 'none', data: buf.toString('base64') }))
        }
    });
    h.check('Batch legt drei Blobs an', res.status === 201 && res.body.stored.length === 3, res.body);

    res = await h.request({
        method: 'POST', url: '/api/cloud/blobs/batch', token: A,
        body: {
            blobs: [
                { hash: sha256(small[0]), data: small[0].toString('base64') },
                { hash: sha256(Buffer.from('a')), data: Buffer.from('b').toString('base64') }
            ]
        }
    });
    h.check('Batch meldet Bekanntes und Falsches getrennt -> 207',
        res.status === 207 && res.body.skipped.length === 1 && res.body.rejected.length === 1, res.body);

    res = await h.request({ method: 'POST', url: '/api/cloud/blobs/batch', token: A, body: { blobs: [] } });
    h.check('leerer Batch -> 400', res.status === 400, res.body);

    h.section('7) Refcounts');

    res = await h.request({
        method: 'POST', url: '/api/cloud/instances', token: A,
        body: { instanceUuid: 'inst-skyblock-1', name: 'Skyblock' }
    });
    h.check('Instanz fuer die Referenzen angelegt', res.status === 201, res.body);

    const [instRows] = await h.pool.query(
        'SELECT id FROM cloud_instances WHERE instance_uuid = ?', ['inst-skyblock-1']
    );
    const instanceId = instRows[0].id;

    const [rev1] = await h.pool.query(
        `INSERT INTO cloud_revisions (instance_id, revision, manifest_blob, entry_count, logical_bytes)
         VALUES (?, ?, ?, ?, ?)`,
        [instanceId, 1, hash, 2, payload.length]
    );
    const revision1 = rev1.insertId;

    let added = await addRefs(revision1, [hash, bigHash, hash]);
    h.check('addRefs zaehlt doppelte Hashes nur einmal', added.added === 2, added);

    const [refcounted] = await h.pool.query('SELECT hash, refcount FROM blobs WHERE hash IN (?, ?)', [hash, bigHash]);
    h.check('refcount steht auf 1', refcounted.every((row) => Number(row.refcount) === 1), refcounted);

    added = await addRefs(revision1, [hash]);
    h.check('addRefs ist idempotent', added.added === 0, added);

    const [rev2] = await h.pool.query(
        `INSERT INTO cloud_revisions (instance_id, revision, manifest_blob, entry_count, logical_bytes)
         VALUES (?, ?, ?, ?, ?)`,
        [instanceId, 2, hash, 1, payload.length]
    );
    await addRefs(rev2.insertId, [hash]);
    const [shared] = await h.pool.query('SELECT refcount FROM blobs WHERE hash = ?', [hash]);
    h.check('zwei Revisionen -> refcount 2', Number(shared[0].refcount) === 2, shared[0]);

    res = await h.request({ url: `/api/cloud/blobs/${hash}`, token: B, raw: true });
    h.check('User B kommt weiterhin nicht an den referenzierten Blob',
        res.status === 404 || res.status === 401, res.status);

    const removed = await removeRefsForRevision(revision1);
    h.check('removeRefsForRevision loest beide Referenzen', removed.removed === 2, removed);

    const [afterRemove] = await h.pool.query('SELECT hash, refcount FROM blobs WHERE hash IN (?, ?)', [hash, bigHash]);
    const byHash = new Map(afterRemove.map((row) => [row.hash, Number(row.refcount)]));
    h.check('der geteilte Blob behaelt refcount 1', byHash.get(hash) === 1, byHash.get(hash));
    h.check('der alleinstehende Blob faellt auf 0', byHash.get(bigHash) === 0, byHash.get(bigHash));

    const [queued] = await h.pool.query('SELECT blob_hash FROM blob_gc_queue');
    h.check('nur der unreferenzierte Blob steht in der GC-Queue',
        queued.length === 1 && queued[0].blob_hash === bigHash, queued);

    h.section('8) Garbage Collection');

    let gc = await runGc({ dryRun: true });
    h.check('Trockenlauf loescht nichts, meldet aber den Kandidaten nicht (noch nicht faellig)',
        gc.examined === 0 && gc.deleted === 0, gc);

    await h.pool.query(`UPDATE blob_gc_queue SET eligible_at = NOW() - INTERVAL '1 hour'`);

    gc = await runGc({ dryRun: true });
    h.check('Trockenlauf zaehlt den faelligen Blob', gc.examined === 1 && gc.deleted === 1, gc);
    h.check('Trockenlauf laesst das Objekt liegen', await exists(blobPath(bigHash)));

    gc = await runGc({ dryRun: false });
    h.check('echter Lauf loescht genau einen Blob', gc.deleted === 1, gc);
    h.check('Objekt ist aus dem Speicher verschwunden', !(await exists(blobPath(bigHash))));
    h.check('referenzierter Blob liegt weiterhin da', await exists(blobPath(hash)));

    const [afterGc] = await h.pool.query('SELECT hash FROM blobs WHERE hash = ?', [bigHash]);
    h.check('blobs-Zeile ist weg', afterGc.length === 0, afterGc);

    await h.pool.query('UPDATE blobs SET refcount = 0 WHERE hash = ?', [hash]);
    await enqueueOrphans([hash]);
    await h.pool.query(`UPDATE blob_gc_queue SET eligible_at = NOW() - INTERVAL '1 hour'`);
    await h.pool.query('UPDATE blobs SET refcount = 2 WHERE hash = ?', [hash]);

    gc = await runGc({ dryRun: false });
    h.check('GC prueft den refcount erneut und loescht nichts Referenziertes',
        gc.revived === 1 && gc.deleted === 0, gc);
    h.check('der referenzierte Blob liegt noch da', await exists(blobPath(hash)));

    h.section('9) Reconcile');

    await h.pool.query('UPDATE blobs SET refcount = ? WHERE hash = ?', [99, hash]);
    let rec = await runReconcile({ dryRun: true });
    h.check('Trockenlauf findet den falschen refcount', rec.refcountsFixed >= 1, rec.refcountSamples);

    const [stillWrong] = await h.pool.query('SELECT refcount FROM blobs WHERE hash = ?', [hash]);
    h.check('Trockenlauf korrigiert nichts', Number(stillWrong[0].refcount) === 99, stillWrong[0]);

    rec = await runReconcile({ dryRun: false });
    const [corrected] = await h.pool.query('SELECT refcount FROM blobs WHERE hash = ?', [hash]);
    h.check('echter Lauf korrigiert den refcount auf den wahren Wert',
        Number(corrected[0].refcount) === 1, corrected[0]);

    const orphanKey = 'blobs/ff/ee/ffee00112233445566778899aabbccddeeff00112233445566778899aabbccdd';
    const orphanFile = path.join(process.env.LUXCLOUD_FS_ROOT, orphanKey);
    await fsp.mkdir(path.dirname(orphanFile), { recursive: true });
    await fsp.writeFile(orphanFile, 'rest eines abgebrochenen uploads');
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await fsp.utimes(orphanFile, old, old);

    rec = await runReconcile({ dryRun: false });
    h.check('Reconcile findet das verwaiste Objekt', rec.orphanObjects === 1, rec);
    h.check('verwaistes Objekt ist geloescht', !(await exists(orphanFile)));
    h.check('bekannte Objekte bleiben unangetastet', await exists(blobPath(hash)));

    h.section('10) Admin');

    h.setSessionUser({ id: userA, username: 'beatv', role: 'user', banned: false });
    res = await h.request({ url: '/api/admin/cloud/gc' });
    h.check('normaler User kommt nicht an den GC-Status -> 403', res.status === 403, res.body);

    h.setSessionUser({ id: admin, username: 'root', role: 'admin', banned: false });
    res = await h.request({ url: '/api/admin/cloud/gc' });
    h.check('Admin sieht den GC-Status', res.status === 200 && res.body.driver === 'fs', res.body);
    h.check('Status nennt Queue und Blob-Statistik',
        typeof res.body.queue.total === 'number' && typeof res.body.blobs.count === 'number', res.body);
    h.check('Status enthaelt die letzten Laeufe', Array.isArray(res.body.history) && res.body.history.length > 0);

    res = await h.request({
        method: 'POST', url: '/api/admin/cloud/gc/run', body: { mode: 'reconcile', dryRun: true }
    });
    h.check('Admin kann den Reconcile anstossen', res.status === 200 && res.body.result.job === 'reconcile', res.body);

    const [audit] = await h.pool.query('SELECT action FROM admin_audit_log');
    h.check('Admin-Aktion landet im Audit-Log',
        audit.some((row) => row.action === 'cloud_reconcile_run'), audit);

    res = await h.request({ method: 'POST', url: '/api/admin/cloud/gc/run', body: { mode: 'unfug' } });
    h.check('unbekannter Modus -> 400', res.status === 400, res.body);

    h.section('11) Faehigkeiten in /me');

    const status = await getGcStatus();
    h.check('getGcStatus meldet den fs-Treiber', status.driver === 'fs', status.driver);

    res = await h.request({ url: '/api/cloud/me', token: A });
    h.check('/me nennt die unterstuetzte Kompression',
        res.body.capabilities && res.body.capabilities.compression.includes('none'), res.body.capabilities);
    h.check('/me nennt die Blob- und Batch-Grenzen',
        res.body.capabilities.maxBlobBytes > 0 && res.body.capabilities.maxBatchBytes > 0,
        res.body.capabilities);

    h.finish();
}

main().catch((err) => {
    console.error('\nTEST HARNESS ERROR:', err);
    process.exit(2);
});
