const crypto = require('crypto');

const { Harness } = require('./luxcloudHarness');

const h = new Harness();

function sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function uploadBlob(token, buffer) {
    const hash = sha256(buffer);
    const res = await h.request({
        method: 'PUT',
        url: `/api/cloud/blobs/${hash}`,
        token,
        body: buffer,
        headers: { 'X-Lux-Compression': 'none' }
    });
    if (res.status !== 201 && res.status !== 409) {
        throw new Error(`upload failed for ${hash}: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return hash;
}

function manifestFor(instanceUuid, entries, overrides = {}) {
    return {
        manifestVersion: 1,
        instanceId: instanceUuid,
        name: 'Skyblock',
        createdAt: 1756582980000,
        runtime: { mcVersion: '1.21.11', loader: 'fabric', loaderVersion: '0.19.3' },
        entries,
        ...overrides
    };
}

function fileEntry(path, buffer, hash) {
    return { path, size: buffer.length, mtime: 1756582980000, sha256: hash, blob: hash };
}

async function main() {
    await h.start();

    const userA = await h.createUser({ googleId: 'g-a', username: 'beatv' });
    const userB = await h.createUser({ googleId: 'g-b', username: 'otheruser' });

    const sessionA = { id: userA, username: 'beatv', role: 'user', banned: false };
    const sessionB = { id: userB, username: 'otheruser', role: 'user', banned: false };

    const A = (await h.authorizeDevice({ user: sessionA, deviceUuid: 'dev-aaaa-0001' })).accessToken;
    const A2 = (await h.authorizeDevice({ user: sessionA, deviceUuid: 'dev-aaaa-0002', deviceName: 'LAPTOP' })).accessToken;
    const B = (await h.authorizeDevice({ user: sessionB, deviceUuid: 'dev-bbbb-0001', platform: 'linux' })).accessToken;

    const UUID = 'inst-skyblock-0001';
    let res;

    await h.request({
        method: 'POST',
        url: '/api/cloud/instances',
        token: A,
        body: { instanceUuid: UUID, name: 'Skyblock', mcVersion: '1.21.11', loader: 'fabric' }
    });

    const config = Buffer.from(JSON.stringify({ fov: 90 }), 'utf8');
    const mod = Buffer.from('x'.repeat(4096), 'utf8');
    const configHash = sha256(config);
    const modHash = sha256(mod);

    h.section('1) Negotiate');

    res = await h.request({
        method: 'POST',
        url: `/api/cloud/instances/${UUID}/negotiate`,
        token: A,
        body: { blobs: [{ hash: configHash, size: config.length }, { hash: modHash, size: mod.length }] }
    });
    h.check('leerer Speicher meldet beide Blobs als fehlend', res.status === 200 && res.body.missing.length === 2, res.body);
    h.check('missingBytes zaehlt die fehlenden Bytes', res.body.missingBytes === config.length + mod.length, res.body);
    h.check('Quota wird mitgeliefert', res.body.quota && res.body.quota.quotaBytes > 0, res.body);

    await uploadBlob(A, config);

    res = await h.request({
        method: 'POST',
        url: `/api/cloud/instances/${UUID}/negotiate`,
        token: A,
        body: { blobs: [{ hash: configHash, size: config.length }, { hash: modHash, size: mod.length }] }
    });
    h.check('hochgeladener Blob gilt als bekannt', res.body.known.includes(configHash), res.body);
    h.check('nur der fehlende Blob bleibt uebrig', res.body.missing.length === 1 && res.body.missing[0] === modHash, res.body);

    res = await h.request({
        method: 'POST',
        url: `/api/cloud/instances/${UUID}/negotiate`,
        token: A,
        body: { blobs: [{ hash: 'nichthex', size: 1 }] }
    });
    h.check('krummer Hash wird abgelehnt', res.status === 400, res.body);

    res = await h.request({
        method: 'POST',
        url: `/api/cloud/instances/${UUID}/negotiate`,
        token: B,
        body: { blobs: [] }
    });
    h.check('fremde Instanz ist nicht sichtbar', res.status === 404, res.body);

    res = await h.request({
        method: 'POST',
        url: `/api/cloud/instances/${UUID}/negotiate`,
        token: A,
        body: { blobs: [{ hash: configHash, size: config.length }], projectedBytes: 99 * 1024 * 1024 * 1024 }
    });
    h.check('zu grosse Projektion meldet quota_exceeded', res.status === 413 && res.body.error === 'quota_exceeded', res.body);

    h.section('2) Commit');

    await uploadBlob(A, mod);

    const entries = [
        fileEntry('config/options.json', config, configHash),
        fileEntry('mods/sodium.jar', mod, modHash)
    ];

    res = await h.request({
        method: 'POST',
        url: `/api/cloud/instances/${UUID}/commit`,
        token: A,
        body: { manifest: manifestFor(UUID, entries), parentRevision: 0 }
    });
    h.check('erster Commit erzeugt Revision 1', res.status === 201 && res.body.revision === 1, res.body);
    h.check('der Commit liefert den Manifest-Hash', /^[0-9a-f]{64}$/.test(String(res.body.manifestHash)), res.body);
    h.check('die Instanz meldet die neue Revision', res.body.instance.revision === 1, res.body.instance);
    h.check('logicalBytes enthaelt Dateien und Manifest',
        res.body.instance.logicalBytes > config.length + mod.length, res.body.instance);
    h.check('usedBytes wurde fortgeschrieben', res.body.quota.usedBytes === res.body.instance.logicalBytes, res.body.quota);

    const firstManifestHash = res.body.manifestHash;

    res = await h.request({
        method: 'POST',
        url: `/api/cloud/instances/${UUID}/commit`,
        token: A,
        body: { manifest: manifestFor(UUID, entries), parentRevision: 0 }
    });
    h.check('veralteter parentRevision gibt 409', res.status === 409 && res.body.error === 'revision_conflict', res.body);
    h.check('der Konflikt nennt die aktuelle Revision', res.body.details.currentRevision === 1, res.body.details);
    h.check('der Konflikt nennt den aktuellen Manifest-Hash',
        res.body.details.currentManifestHash === firstManifestHash, res.body.details);

    res = await h.request({
        method: 'POST',
        url: `/api/cloud/instances/${UUID}/commit`,
        token: A,
        body: { manifest: manifestFor(UUID, entries, { name: 'Skyblock v2' }), parentRevision: 1 }
    });
    h.check('zweiter Commit erzeugt Revision 2', res.status === 201 && res.body.revision === 2, res.body);
    h.check('der Name wird uebernommen', res.body.instance.name === 'Skyblock v2', res.body.instance);

    h.section('3) Commit weist Unzulaessiges ab');

    const fremd = Buffer.from('geheim', 'utf8');
    const fremdHash = await uploadBlob(B, fremd);

    res = await h.request({
        method: 'POST',
        url: `/api/cloud/instances/${UUID}/commit`,
        token: A,
        body: {
            manifest: manifestFor(UUID, [fileEntry('config/fremd.json', fremd, fremdHash)]),
            parentRevision: 2
        }
    });
    h.check('fremder Blob wird abgewiesen', res.status === 403 && res.body.error === 'forbidden', res.body);

    const nieHochgeladen = sha256(Buffer.from('gibt es nicht', 'utf8'));
    res = await h.request({
        method: 'POST',
        url: `/api/cloud/instances/${UUID}/commit`,
        token: A,
        body: {
            manifest: manifestFor(UUID, [{
                path: 'config/fehlt.json', size: 10, mtime: 1, sha256: nieHochgeladen, blob: nieHochgeladen
            }]),
            parentRevision: 2
        }
    });
    h.check('unbekannter Blob gibt missing_blobs', res.status === 422 && res.body.error === 'missing_blobs', res.body);

    res = await h.request({
        method: 'POST',
        url: `/api/cloud/instances/${UUID}/commit`,
        token: A,
        body: {
            manifest: manifestFor(UUID, [{
                path: '../../etc/passwd', size: 1, mtime: 1, sha256: configHash, blob: configHash
            }]),
            parentRevision: 2
        }
    });
    h.check('Path Traversal wird abgewiesen', res.status === 422 && res.body.error === 'invalid_manifest', res.body);

    res = await h.request({
        method: 'POST',
        url: `/api/cloud/instances/${UUID}/commit`,
        token: A,
        body: { manifest: manifestFor('inst-andere-0002', entries), parentRevision: 2 }
    });
    h.check('Manifest einer anderen Instanz wird abgewiesen', res.status === 422, res.body);

    res = await h.request({
        method: 'POST',
        url: `/api/cloud/instances/${UUID}/commit`,
        token: A,
        body: { manifest: manifestFor(UUID, entries), parentRevision: -1 }
    });
    h.check('negativer parentRevision wird abgewiesen', res.status === 400, res.body);

    res = await h.request({
        method: 'POST',
        url: `/api/cloud/instances/${UUID}/commit`,
        token: B,
        body: { manifest: manifestFor(UUID, entries), parentRevision: 2 }
    });
    h.check('fremder Nutzer kann nicht committen', res.status === 404, res.body);

    h.section('4) Nichts bleibt halb stehen');

    const [instRows] = await h.pool.query(
        'SELECT id, current_revision, logical_bytes FROM cloud_instances WHERE instance_uuid = ?',
        [UUID]
    );
    h.check('die Instanz steht weiterhin auf Revision 2', Number(instRows[0].current_revision) === 2, instRows[0]);

    const [revRows] = await h.pool.query(
        'SELECT COUNT(*) AS count FROM cloud_revisions WHERE instance_id = ?',
        [instRows[0].id]
    );
    h.check('die abgewiesenen Commits haben keine Revision hinterlassen',
        Number(revRows[0].count) === 2, revRows[0]);

    h.section('5) Refcounts und Manifest-Blob');

    const [refRows] = await h.pool.query(
        `SELECT br.blob_hash FROM blob_refs br
           JOIN cloud_revisions r ON r.id = br.revision_id
          WHERE r.instance_id = ? AND r.revision = 1`,
        [instRows[0].id]
    );
    const refs = refRows.map((row) => row.blob_hash);
    h.check('Revision 1 referenziert beide Dateien und das Manifest',
        refs.length === 3 && refs.includes(configHash) && refs.includes(modHash)
        && refs.includes(firstManifestHash), refs);

    const [blobRow] = await h.pool.query('SELECT refcount FROM blobs WHERE hash = ?', [configHash]);
    h.check('der geteilte Blob hat refcount 2 nach zwei Revisionen',
        Number(blobRow[0].refcount) === 2, blobRow[0]);

    h.section('6) Manifest lesen');

    res = await h.request({ method: 'GET', url: `/api/cloud/instances/${UUID}/manifest`, token: A });
    h.check('latest liefert die aktuelle Revision', res.status === 200 && res.body.revision === 2, res.body);
    h.check('das Manifest kommt unveraendert zurueck', res.body.manifest.name === 'Skyblock v2', res.body.manifest);
    h.check('die Eintraege sind vollstaendig', res.body.manifest.entries.length === 2, res.body.manifest);

    res = await h.request({ method: 'GET', url: `/api/cloud/instances/${UUID}/manifest?revision=1`, token: A });
    h.check('eine alte Revision ist weiterhin lesbar',
        res.status === 200 && res.body.manifest.name === 'Skyblock', res.body);
    h.check('parentRevision der ersten Revision ist null', res.body.parentRevision === null, res.body);

    res = await h.request({ method: 'GET', url: `/api/cloud/instances/${UUID}/manifest?revision=99`, token: A });
    h.check('unbekannte Revision gibt 404', res.status === 404, res.body);

    res = await h.request({ method: 'GET', url: `/api/cloud/instances/${UUID}/manifest?revision=0`, token: A });
    h.check('Revision 0 wird abgewiesen', res.status === 400, res.body);

    res = await h.request({ method: 'GET', url: `/api/cloud/instances/${UUID}/manifest`, token: B });
    h.check('fremdes Manifest ist nicht lesbar', res.status === 404, res.body);

    h.section('7) Zweites Geraet desselben Kontos');

    res = await h.request({ method: 'GET', url: `/api/cloud/instances/${UUID}/manifest`, token: A2 });
    h.check('das zweite Geraet liest dasselbe Manifest',
        res.status === 200 && res.body.manifestHash === (await h.request({
            method: 'GET', url: `/api/cloud/instances/${UUID}/head`, token: A
        })).body.manifestHash, res.body.manifestHash);

    res = await h.request({
        method: 'POST',
        url: `/api/cloud/instances/${UUID}/commit`,
        token: A2,
        body: { manifest: manifestFor(UUID, entries, { name: 'Vom Laptop' }), parentRevision: 2 }
    });
    h.check('das zweite Geraet darf committen', res.status === 201 && res.body.revision === 3, res.body);

    const [devRow] = await h.pool.query(
        `SELECT d.device_uuid FROM cloud_revisions r
           JOIN client_devices d ON d.id = r.device_id
          WHERE r.instance_id = ? AND r.revision = 3`,
        [instRows[0].id]
    );
    h.check('die Revision merkt sich das schreibende Geraet',
        devRow[0].device_uuid === 'dev-aaaa-0002', devRow[0]);

    h.section('8) Revisionsliste');

    res = await h.request({ method: 'GET', url: `/api/cloud/instances/${UUID}/revisions`, token: A });
    h.check('alle drei Revisionen sind gelistet', res.status === 200 && res.body.revisions.length === 3, res.body);
    h.check('die neueste steht oben', res.body.revisions[0].revision === 3, res.body.revisions[0]);
    h.check('die Liste nennt das Geraet', res.body.revisions[0].device.deviceUuid === 'dev-aaaa-0002', res.body.revisions[0]);
    h.check('currentRevision stimmt', res.body.currentRevision === 3, res.body);

    res = await h.request({ method: 'GET', url: `/api/cloud/instances/${UUID}/revisions`, token: B });
    h.check('fremde Revisionsliste ist nicht sichtbar', res.status === 404, res.body);

    h.section('9) Quota beim Commit');

    await h.pool.query('UPDATE user_cloud_settings SET quota_bytes = ? WHERE user_id = ?', [1024, userA]);

    res = await h.request({
        method: 'POST',
        url: `/api/cloud/instances/${UUID}/commit`,
        token: A,
        body: { manifest: manifestFor(UUID, entries, { name: 'Zu gross' }), parentRevision: 3 }
    });
    h.check('ein Commit ueber der Quota wird abgewiesen',
        res.status === 413 && res.body.error === 'quota_exceeded', res.body);

    const [afterQuota] = await h.pool.query(
        'SELECT current_revision FROM cloud_instances WHERE instance_uuid = ?',
        [UUID]
    );
    h.check('die Instanz bleibt auf Revision 3', Number(afterQuota[0].current_revision) === 3, afterQuota[0]);

    h.finish();
}

main().catch((err) => {
    console.error(err);
    h.stop();
    process.exit(1);
});
