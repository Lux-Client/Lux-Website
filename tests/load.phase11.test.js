const crypto = require('crypto');

const { Harness } = require('./luxcloudHarness');

const h = new Harness();

const DEVICES = Number(process.env.LUXCLOUD_LOAD_DEVICES || 40);
const INSTANCES_PER_DEVICE = Number(process.env.LUXCLOUD_LOAD_INSTANCES || 3);
const FILES_PER_INSTANCE = Number(process.env.LUXCLOUD_LOAD_FILES || 12);
const SHARED_RATIO = 0.7;

function sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

const sharedPool = [];
for (let i = 0; i < 20; i += 1) {
    sharedPool.push(Buffer.from(`shared-mod-${i}-`.repeat(64), 'utf8'));
}

function fileFor(device, instance, index) {
    if (Math.random() < SHARED_RATIO) {
        return sharedPool[Math.floor(Math.random() * sharedPool.length)];
    }
    return Buffer.from(`private-${device}-${instance}-${index}-${crypto.randomBytes(8).toString('hex')}`.repeat(32), 'utf8');
}

async function uploadBlob(token, buffer) {
    const hash = sha256(buffer);
    const res = await h.request({
        method: 'PUT', url: `/api/cloud/blobs/${hash}`, token, body: buffer,
        headers: { 'X-Lux-Compression': 'none' }
    });
    return { hash, status: res.status, stored: res.status === 201, deduped: res.status === 409 };
}

function percentile(values, p) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

async function main() {
    await h.start();

    console.log(`\nLast: ${DEVICES} Geraete x ${INSTANCES_PER_DEVICE} Instanzen x ${FILES_PER_INSTANCE} Dateien`);

    const { signAccessToken } = require('../middleware/deviceAuth');

    const tokens = [];
    for (let i = 0; i < DEVICES; i += 1) {
        const userId = await h.createUser({ googleId: `g-load-${i}`, username: `load${i}` });
        const deviceUuid = `dev-load-${i}`;

        await h.pool.query(
            'INSERT INTO client_devices (user_id, device_uuid, name, platform, token_generation) VALUES (?, ?, ?, ?, ?)',
            [userId, deviceUuid, `PC ${i}`, 'win32', 1]
        );
        await h.pool.query(
            'INSERT INTO user_cloud_settings (user_id) VALUES (?) ON CONFLICT (user_id) DO NOTHING RETURNING user_id',
            [userId]
        );

        tokens.push({
            userId,
            token: signAccessToken({ userId, deviceUuid, generation: 1 })
        });
    }

    const started = Date.now();
    const commitTimes = [];
    const headTimes = [];
    let uploaded = 0;
    let deduped = 0;
    let logicalBytes = 0;
    let failures = 0;

    for (let d = 0; d < tokens.length; d += 1) {
        const { token } = tokens[d];

        for (let n = 0; n < INSTANCES_PER_DEVICE; n += 1) {
            const uuid = `inst-load-${d}-${n}`;
            await h.request({
                method: 'POST', url: '/api/cloud/instances', token,
                body: { instanceUuid: uuid, name: `Instance ${d}-${n}` }
            });

            const entries = [];
            const seen = new Set();

            for (let f = 0; f < FILES_PER_INSTANCE; f += 1) {
                const buffer = fileFor(d, n, f);
                const hash = sha256(buffer);
                if (seen.has(hash)) continue;
                seen.add(hash);

                const result = await uploadBlob(token, buffer);
                if (result.stored) uploaded += 1;
                else if (result.deduped) deduped += 1;
                else failures += 1;

                logicalBytes += buffer.length;
                entries.push({
                    path: `config/file-${f}.dat`,
                    size: buffer.length,
                    mtime: 1,
                    sha256: hash,
                    blob: hash
                });
            }

            const commitStart = Date.now();
            const res = await h.request({
                method: 'POST', url: `/api/cloud/instances/${uuid}/commit`, token,
                body: {
                    manifest: {
                        manifestVersion: 1,
                        instanceId: uuid,
                        name: `Instance ${d}-${n}`,
                        createdAt: 1756582980000,
                        entries
                    },
                    parentRevision: 0
                }
            });
            commitTimes.push(Date.now() - commitStart);
            if (res.status !== 201) failures += 1;
        }
    }

    const uploadDuration = Date.now() - started;

    for (let i = 0; i < 200; i += 1) {
        const pick = tokens[i % tokens.length];
        const uuid = `inst-load-${i % tokens.length}-0`;
        const headStart = Date.now();
        const res = await h.request({ method: 'GET', url: `/api/cloud/instances/${uuid}/head`, token: pick.token });
        headTimes.push(Date.now() - headStart);
        if (res.status !== 200) failures += 1;
    }

    h.section('1) Durchsatz');

    const totalInstances = DEVICES * INSTANCES_PER_DEVICE;
    h.check('alle Instanzen sind durchgelaufen', failures === 0, { failures });

    const [instanceCount] = await h.pool.query('SELECT COUNT(*) AS count FROM cloud_instances');
    h.check(`${totalInstances} Instanzen liegen in der Datenbank`,
        Number(instanceCount[0].count) === totalInstances, instanceCount[0]);

    const [revisionCount] = await h.pool.query('SELECT COUNT(*) AS count FROM cloud_revisions');
    h.check('jede hat genau eine Revision',
        Number(revisionCount[0].count) === totalInstances, revisionCount[0]);

    h.section('2) Deduplizierung');

    const [blobStats] = await h.pool.query(
        'SELECT COUNT(*) AS count, COALESCE(SUM(size), 0) AS physical FROM blobs'
    );
    const physical = Number(blobStats[0].physical);
    const factor = physical > 0 ? logicalBytes / physical : 0;

    console.log(`\n  logisch:  ${(logicalBytes / 1024).toFixed(0)} KB`);
    console.log(`  physisch: ${(physical / 1024).toFixed(0)} KB in ${blobStats[0].count} Blobs`);
    console.log(`  Faktor:   ${factor.toFixed(2)}x`);
    console.log(`  Uploads:  ${uploaded} gespeichert, ${deduped} dedupliziert`);

    h.check('Deduplizierung greift', factor > 1.5, { factor });
    h.check('es wurden Uploads eingespart', deduped > uploaded, { uploaded, deduped });

    h.section('3) Antwortzeiten');

    const commitP95 = percentile(commitTimes, 0.95);
    const headP95 = percentile(headTimes, 0.95);

    console.log(`\n  commit p50/p95: ${percentile(commitTimes, 0.5)} / ${commitP95} ms`);
    console.log(`  head   p50/p95: ${percentile(headTimes, 0.5)} / ${headP95} ms`);
    console.log(`  Gesamtdauer Upload-Phase: ${(uploadDuration / 1000).toFixed(1)} s`);

    h.check('head bleibt schnell (p95 unter 100 ms)', headP95 < 100, { headP95 });
    h.check('commit bleibt vertretbar (p95 unter 2 s)', commitP95 < 2000, { commitP95 });

    h.section('4) Buchhaltung stimmt nach der Last');

    const { runReconcile } = require('../jobs/cloudGc');
    const reconcile = await runReconcile({ dryRun: true });
    h.check('kein refcount ist verrutscht',
        !reconcile.mismatches || reconcile.mismatches === 0, reconcile);

    const [orphans] = await h.pool.query('SELECT COUNT(*) AS count FROM blobs WHERE refcount <= 0');
    h.check('kein referenzierter Blob steht auf 0', Number(orphans[0].count) === 0, orphans[0]);

    const [sumRows] = await h.pool.query(
        `SELECT s.user_id, s.used_bytes, COALESCE(SUM(i.logical_bytes), 0) AS actual
           FROM user_cloud_settings s
           LEFT JOIN cloud_instances i ON i.user_id = s.user_id
          GROUP BY s.user_id, s.used_bytes`
    );
    const wrong = sumRows.filter((row) => Number(row.used_bytes) !== Number(row.actual));
    h.check('used_bytes stimmt bei jedem Konto', wrong.length === 0, wrong.slice(0, 3));

    h.section('5) Abbruch mitten im Vorgang');

    const victim = tokens[0];
    const orphanBlob = Buffer.from(`orphan-${crypto.randomBytes(16).toString('hex')}`, 'utf8');
    const orphanHash = (await uploadBlob(victim.token, orphanBlob)).hash;

    const [beforeCommit] = await h.pool.query('SELECT refcount FROM blobs WHERE hash = ?', [orphanHash]);
    h.check('ein hochgeladener, nie committeter Blob hat refcount 0',
        Number(beforeCommit[0].refcount) === 0, beforeCommit[0]);

    const [claim] = await h.pool.query(
        'SELECT COUNT(*) AS count FROM blob_upload_claims WHERE blob_hash = ?', [orphanHash]
    );
    h.check('er ist aber als Anspruch vermerkt', Number(claim[0].count) === 1, claim[0]);

    let res = await h.request({ method: 'GET', url: `/api/cloud/blobs/${orphanHash}`, token: victim.token });
    h.check('der Uploader darf ihn noch lesen', res.status === 200, res.status);

    res = await h.request({ method: 'GET', url: `/api/cloud/blobs/${orphanHash}`, token: tokens[1].token });
    h.check('ein anderes Konto nicht', res.status === 404, res.status);

    h.finish();
}

main().catch((err) => {
    console.error(err);
    h.stop();
    process.exit(1);
});
