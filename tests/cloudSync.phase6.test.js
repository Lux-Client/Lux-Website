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
        throw new Error(`upload failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return hash;
}

function manifestFor(uuid, entries, overrides = {}) {
    return {
        manifestVersion: 1,
        instanceId: uuid,
        name: 'Skyblock',
        createdAt: 1756582980000,
        runtime: { mcVersion: '1.21.11', loader: 'fabric', loaderVersion: '0.19.3' },
        entries,
        ...overrides
    };
}

function fileEntry(path, buffer) {
    const hash = sha256(buffer);
    return { path, size: buffer.length, mtime: 1756582980000, sha256: hash, blob: hash };
}

async function main() {
    await h.start();

    const { selectRevisionsToDrop, degradeWorlds, pruneRevisions, purgeTrash } = require('../jobs/cloudRetention');

    const userId = await h.createUser({ googleId: 'g-p6', username: 'beatv' });
    const session = { id: userId, username: 'beatv', role: 'user', banned: false };
    const A = (await h.authorizeDevice({ user: session, deviceUuid: 'dev-p6-0001' })).accessToken;

    const UUID = 'inst-p6-skyblock';
    let res;

    await h.request({
        method: 'POST',
        url: '/api/cloud/instances',
        token: A,
        body: { instanceUuid: UUID, name: 'Skyblock' }
    });

    const cfgV1 = Buffer.from('{"fov":90}', 'utf8');
    const cfgV2 = Buffer.from('{"fov":70}', 'utf8');
    const mod = Buffer.from('m'.repeat(2048), 'utf8');

    await uploadBlob(A, cfgV1);
    await uploadBlob(A, cfgV2);
    await uploadBlob(A, mod);

    const v1 = [fileEntry('config/a.json', cfgV1), fileEntry('mods/x.jar', mod)];
    const v2 = [fileEntry('config/a.json', cfgV2), fileEntry('mods/x.jar', mod)];

    await h.request({
        method: 'POST', url: `/api/cloud/instances/${UUID}/commit`, token: A,
        body: { manifest: manifestFor(UUID, v1), parentRevision: 0 }
    });
    await h.request({
        method: 'POST', url: `/api/cloud/instances/${UUID}/commit`, token: A,
        body: { manifest: manifestFor(UUID, v2, { name: 'Skyblock v2' }), parentRevision: 1 }
    });

    h.section('1) Rollback');

    res = await h.request({
        method: 'POST',
        url: `/api/cloud/instances/${UUID}/revisions/1/rollback`,
        token: A
    });
    h.check('Rollback erzeugt eine neue Revision', res.status === 201 && res.body.revision === 3, res.body);
    h.check('die Antwort nennt das Ziel', res.body.rolledBackTo === 1, res.body);
    h.check('der alte Name ist zurueck', res.body.instance.name === 'Skyblock', res.body.instance);

    res = await h.request({ method: 'GET', url: `/api/cloud/instances/${UUID}/manifest`, token: A });
    h.check('das Manifest entspricht wieder Revision 1',
        res.body.manifest.entries.find((e) => e.path === 'config/a.json').sha256 === sha256(cfgV1),
        res.body.manifest.entries);

    h.check('die alte Revision bleibt erhalten',
        (await h.request({ method: 'GET', url: `/api/cloud/instances/${UUID}/revisions`, token: A }))
            .body.revisions.length === 3, null);

    res = await h.request({
        method: 'POST', url: `/api/cloud/instances/${UUID}/revisions/3/rollback`, token: A
    });
    h.check('Rollback auf die aktuelle Revision wird abgelehnt',
        res.status === 409 && res.body.error === 'already_current', res.body);

    res = await h.request({
        method: 'POST', url: `/api/cloud/instances/${UUID}/revisions/99/rollback`, token: A
    });
    h.check('Rollback auf eine unbekannte Revision gibt 404', res.status === 404, res.body);

    h.section('2) Retention-Auswahl');

    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const mk = (id, revision, ageDays, extra = {}) => ({
        id,
        revision,
        current_revision: 100,
        created_at: new Date(now - ageDays * day).toISOString(),
        keep_until: null,
        has_worlds: false,
        ...extra
    });

    let drop = selectRevisionsToDrop([mk(1, 100, 0), mk(2, 99, 1), mk(3, 98, 3)], now);
    h.check('innerhalb von 7 Tagen wird nichts verworfen', drop.length === 0, drop);

    drop = selectRevisionsToDrop([
        mk(1, 100, 0),
        mk(2, 99, 10),
        mk(3, 98, 10),
        mk(4, 97, 10)
    ], now);
    h.check('von drei Revisionen desselben Tages bleibt eine', drop.length === 2, drop.map((d) => d.id));

    drop = selectRevisionsToDrop([
        mk(1, 100, 0),
        mk(2, 99, 200),
        mk(3, 98, 201)
    ], now);
    h.check('jenseits von 90 Tagen wird verworfen', drop.length === 2, drop.map((d) => d.id));

    drop = selectRevisionsToDrop([
        mk(1, 100, 0),
        mk(2, 99, 200, { keep_until: new Date(now + day).toISOString() })
    ], now);
    h.check('eine markierte Revision bleibt', drop.length === 0, drop);

    const many = [mk(1, 100, 0)];
    for (let i = 2; i <= 40; i += 1) many.push(mk(i, 101 - i, 10 + i));
    drop = selectRevisionsToDrop(many, now);
    h.check('die Obergrenze von 20 Revisionen greift', many.length - drop.length <= 20, {
        kept: many.length - drop.length
    });

    const currentOnly = selectRevisionsToDrop([mk(1, 100, 5000)], now);
    h.check('die aktuelle Revision wird nie verworfen', currentOnly.length === 0, currentOnly);

    h.section('3) Retention gegen die Datenbank');

    const [instRows] = await h.pool.query('SELECT id FROM cloud_instances WHERE instance_uuid = ?', [UUID]);
    const instanceId = instRows[0].id;

    await h.pool.query(
        `UPDATE cloud_revisions SET created_at = NOW() - INTERVAL '200 days'
          WHERE instance_id = ? AND revision IN (1, 2)`,
        [instanceId]
    );

    const dry = await pruneRevisions({ dryRun: true });
    h.check('der Trockenlauf wirft alte Revisionen aus', dry.dropped >= 2, dry);

    const [beforeRows] = await h.pool.query(
        'SELECT COUNT(*) AS count FROM cloud_revisions WHERE instance_id = ?', [instanceId]
    );
    h.check('der Trockenlauf loescht nichts', Number(beforeRows[0].count) === 3, beforeRows[0]);

    const real = await pruneRevisions({ dryRun: false });
    h.check('der echte Lauf loescht die alten Revisionen', real.dropped >= 2, real);

    const [afterRows] = await h.pool.query(
        'SELECT revision FROM cloud_revisions WHERE instance_id = ?', [instanceId]
    );
    h.check('nur die aktuelle Revision bleibt',
        afterRows.length === 1 && Number(afterRows[0].revision) === 3, afterRows);

    const [modBlob] = await h.pool.query('SELECT refcount FROM blobs WHERE hash = ?', [sha256(mod)]);
    h.check('der refcount ist mitgelaufen', Number(modBlob[0].refcount) === 1, modBlob[0]);

    const [cfgV2Blob] = await h.pool.query('SELECT refcount FROM blobs WHERE hash = ?', [sha256(cfgV2)]);
    h.check('ein nicht mehr referenzierter Blob faellt auf 0', Number(cfgV2Blob[0].refcount) === 0, cfgV2Blob[0]);

    h.section('4) Papierkorb');

    await h.request({ method: 'DELETE', url: `/api/cloud/instances/${UUID}`, token: A });

    let purged = await purgeTrash({ dryRun: false });
    h.check('ein frischer Papierkorb wird nicht geleert', purged.purged === 0, purged);

    await h.pool.query(
        `UPDATE cloud_instances SET trashed_at = NOW() - INTERVAL '60 days' WHERE id = ?`,
        [instanceId]
    );

    purged = await purgeTrash({ dryRun: false });
    h.check('nach der Frist wird geleert', purged.purged === 1, purged);

    const [gone] = await h.pool.query('SELECT id FROM cloud_instances WHERE id = ?', [instanceId]);
    h.check('die Instanz ist wirklich weg', gone.length === 0, gone);

    const [usage] = await h.pool.query('SELECT used_bytes FROM user_cloud_settings WHERE user_id = ?', [userId]);
    h.check('der Verbrauch ist zurueckgesetzt', Number(usage[0].used_bytes) === 0, usage[0]);

    h.section('5) Welten-Degradierung');

    const UUID2 = 'inst-p6-welten';
    await h.request({
        method: 'POST', url: '/api/cloud/instances', token: A,
        body: { instanceUuid: UUID2, name: 'Welten' }
    });

    const world = Buffer.from('w'.repeat(4096), 'utf8');
    await uploadBlob(A, world);
    const cfg = Buffer.from('{"n":1}', 'utf8');
    await uploadBlob(A, cfg);

    for (let i = 0; i < 5; i += 1) {
        const marker = Buffer.from(`{"n":${i}}`, 'utf8');
        await uploadBlob(A, marker);
        await h.request({
            method: 'POST', url: `/api/cloud/instances/${UUID2}/commit`, token: A,
            body: {
                manifest: manifestFor(UUID2, [
                    fileEntry('saves/Welt/region/r.0.0.mca', world),
                    fileEntry('config/n.json', marker)
                ], { name: 'Welten' }),
                parentRevision: i
            }
        });
    }

    const [w2] = await h.pool.query('SELECT id FROM cloud_instances WHERE instance_uuid = ?', [UUID2]);
    const [withWorlds] = await h.pool.query(
        'SELECT COUNT(*) AS count FROM cloud_revisions WHERE instance_id = ? AND has_worlds = TRUE',
        [w2[0].id]
    );
    h.check('alle fuenf Revisionen tragen Welten', Number(withWorlds[0].count) === 5, withWorlds[0]);

    const degraded = await degradeWorlds({ dryRun: false });
    h.check('aeltere Revisionen verlieren ihre Welt-Blobs', degraded.degraded === 2, degraded);

    const [stillWorlds] = await h.pool.query(
        'SELECT COUNT(*) AS count FROM cloud_revisions WHERE instance_id = ? AND has_worlds = TRUE',
        [w2[0].id]
    );
    h.check('die letzten drei behalten sie', Number(stillWorlds[0].count) === 3, stillWorlds[0]);

    const [worldBlob] = await h.pool.query('SELECT refcount FROM blobs WHERE hash = ?', [sha256(world)]);
    h.check('der Welt-Blob bleibt referenziert, aber seltener',
        Number(worldBlob[0].refcount) === 3, worldBlob[0]);

    h.finish();
}

main().catch((err) => {
    console.error(err);
    h.stop();
    process.exit(1);
});
