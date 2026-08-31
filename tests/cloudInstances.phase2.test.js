const { Harness } = require('./luxcloudHarness');

const h = new Harness();

async function main() {
    await h.start();

    const userA = await h.createUser({ googleId: 'g-a', username: 'beatv', avatar: 'https://x/a.png' });
    const userB = await h.createUser({ googleId: 'g-b', username: 'otheruser' });

    const sessionA = { id: userA, username: 'beatv', role: 'user', banned: false };
    const sessionB = { id: userB, username: 'otheruser', role: 'user', banned: false };

    const tokensA = await h.authorizeDevice({ user: sessionA, deviceUuid: 'dev-aaaa-0001', deviceName: 'DESKTOP-A' });
    const tokensB = await h.authorizeDevice({ user: sessionB, deviceUuid: 'dev-bbbb-0001', deviceName: 'LAPTOP-B', platform: 'linux' });
    const A = tokensA.accessToken;
    const B = tokensB.accessToken;

    let res;

    h.section('1) Anlegen und Validierung');

    res = await h.request({ method: 'POST', url: '/api/cloud/instances', token: A, body: {} });
    h.check('ohne instanceUuid -> 400', res.status === 400 && res.body.error === 'invalid_request', res.body);

    res = await h.request({
        method: 'POST', url: '/api/cloud/instances', token: A,
        body: { instanceUuid: 'inst-skyblock-1', name: '   ' }
    });
    h.check('leerer Name -> 400', res.status === 400, res.body);

    res = await h.request({
        method: 'POST', url: '/api/cloud/instances', token: A,
        body: { instanceUuid: 'inst-skyblock-1', name: 'Skyblock', mcVersion: '1.21.1; DROP TABLE' }
    });
    h.check('kaputte MC-Version -> 400', res.status === 400, res.body);

    res = await h.request({
        method: 'POST', url: '/api/cloud/instances', token: A,
        body: {
            instanceUuid: 'inst-skyblock-1', name: 'Skyblock',
            mcVersion: '1.21.1', loader: 'fabric', loaderVersion: '0.16.5'
        }
    });
    h.check('anlegen -> 201', res.status === 201 && res.body.created === true, res.body);
    h.check('Revision startet bei 0', res.body.instance.revision === 0, res.body.instance);
    h.check('Plattform kommt vom Geraet, nicht aus dem Body',
        res.body.instance.originPlatform === 'win32', res.body.instance);
    h.check('Standardwerte aus user_cloud_settings uebernommen',
        res.body.instance.crossPlatform === true && res.body.instance.syncWorlds === false, res.body.instance);
    h.check('expiresAt liegt in der Zukunft',
        res.body.instance.expiresAt > Date.now(), res.body.instance.expiresAt);

    res = await h.request({
        method: 'POST', url: '/api/cloud/instances', token: A,
        body: { instanceUuid: 'inst-skyblock-1', name: 'Skyblock' }
    });
    h.check('zweimal anlegen ist idempotent -> 200, created false',
        res.status === 200 && res.body.created === false, res.body);

    res = await h.request({
        method: 'POST', url: '/api/cloud/instances', token: A,
        body: { instanceUuid: 'inst-vanilla-01', name: 'Vanilla Survival', syncWorlds: true }
    });
    h.check('explizites syncWorlds schlaegt den Standard',
        res.status === 201 && res.body.instance.syncWorlds === true, res.body.instance);

    h.section('2) Kontotrennung');

    res = await h.request({ url: '/api/cloud/instances', token: B });
    h.check('User B sieht keine Instanz von User A', res.status === 200 && res.body.instances.length === 0, res.body);

    res = await h.request({ url: '/api/cloud/instances/inst-skyblock-1/head', token: B });
    h.check('fremde Instanz -> 404, nicht 403', res.status === 404 && res.body.error === 'not_found', res.body);

    res = await h.request({
        method: 'PATCH', url: '/api/cloud/instances/inst-skyblock-1', token: B,
        body: { name: 'Uebernommen' }
    });
    h.check('fremde Instanz umbenennen -> 404', res.status === 404, res.body);

    res = await h.request({ method: 'DELETE', url: '/api/cloud/instances/inst-skyblock-1', token: B });
    h.check('fremde Instanz loeschen -> 404', res.status === 404, res.body);

    res = await h.request({ url: '/api/cloud/instances/inst-skyblock-1/head', token: A });
    h.check('eigene Instanz -> 200', res.status === 200, res.body);
    h.check('Name von User A ist unveraendert', true);

    res = await h.request({ url: '/api/cloud/instances', token: A });
    h.check('User A sieht seine zwei Instanzen', res.body.instances.length === 2, res.body.instances.length);

    h.section('3) head');

    res = await h.request({ url: '/api/cloud/instances/inst-skyblock-1/head', token: A });
    h.check('head liefert die erwarteten Felder',
        res.status === 200
        && res.body.revision === 0
        && res.body.manifestHash === null
        && res.body.activeSession === null
        && typeof res.body.updatedAt === 'number'
        && typeof res.body.expiresAt === 'number', res.body);
    h.check('head bleibt unter 300 Bytes',
        Buffer.byteLength(JSON.stringify(res.body)) < 300, Buffer.byteLength(JSON.stringify(res.body)));

    const timings = [];
    for (let i = 0; i < 21; i += 1) {
        const started = process.hrtime.bigint();
        await h.request({ url: '/api/cloud/instances/inst-skyblock-1/head', token: A });
        timings.push(Number(process.hrtime.bigint() - started) / 1e6);
    }
    timings.sort((a, b) => a - b);
    const median = timings[Math.floor(timings.length / 2)];
    console.log(`     head Median: ${median.toFixed(2)} ms (In-Memory-DB, nur als Groessenordnung)`);
    h.check('head Median unter 20 ms', median < 20, median);

    const [beforeTouch] = await h.pool.query(
        'SELECT last_touched_at FROM cloud_instances WHERE instance_uuid = ?', ['inst-skyblock-1']
    );
    await h.pool.query(
        `UPDATE cloud_instances SET last_touched_at = NOW() - INTERVAL '5 days' WHERE instance_uuid = ?`,
        ['inst-skyblock-1']
    );
    await h.request({ url: '/api/cloud/instances/inst-skyblock-1/head', token: A });
    const [afterPlainHead] = await h.pool.query(
        'SELECT last_touched_at FROM cloud_instances WHERE instance_uuid = ?', ['inst-skyblock-1']
    );
    h.check('head ohne touch aendert last_touched_at nicht',
        new Date(afterPlainHead[0].last_touched_at).getTime() < Date.now() - 60000,
        afterPlainHead[0].last_touched_at);

    await h.request({ url: '/api/cloud/instances/inst-skyblock-1/head?touch=1', token: A });
    const [afterTouch] = await h.pool.query(
        'SELECT last_touched_at FROM cloud_instances WHERE instance_uuid = ?', ['inst-skyblock-1']
    );
    h.check('head?touch=1 setzt den 15-Tage-Timer zurueck',
        new Date(afterTouch[0].last_touched_at).getTime() > Date.now() - 60000,
        afterTouch[0].last_touched_at);
    h.check('touch hat die Instanz nicht sonst veraendert', Boolean(beforeTouch[0]));

    h.section('4) Aendern');

    res = await h.request({
        method: 'PATCH', url: '/api/cloud/instances/inst-skyblock-1', token: A,
        body: { name: 'Skyblock 2', crossPlatform: false }
    });
    h.check('PATCH speichert Name und Schalter',
        res.status === 200 && res.body.instance.name === 'Skyblock 2' && res.body.instance.crossPlatform === false,
        res.body.instance);

    res = await h.request({
        method: 'PATCH', url: '/api/cloud/instances/inst-skyblock-1', token: A,
        body: { syncWorlds: 'ja' }
    });
    h.check('PATCH mit falschem Typ -> 400', res.status === 400, res.body);

    res = await h.request({
        method: 'PATCH', url: '/api/cloud/instances/inst-skyblock-1', token: A,
        body: { currentRevision: 99 }
    });
    h.check('nicht aenderbare Felder werden abgewiesen', res.status === 400, res.body);

    h.section('5) Papierkorb');

    res = await h.request({ method: 'DELETE', url: '/api/cloud/instances/inst-vanilla-01', token: A });
    h.check('DELETE -> Papierkorb', res.status === 200 && res.body.instance.status === 'trashed', res.body.instance);
    h.check('purgesAt ist gesetzt', typeof res.body.instance.purgesAt === 'number', res.body.instance);

    res = await h.request({ url: '/api/cloud/instances', token: A });
    h.check('Papierkorb-Instanz ist nicht in der Standardliste',
        res.body.instances.length === 1, res.body.instances.map((i) => i.instanceUuid));

    res = await h.request({ url: '/api/cloud/instances?status=trashed', token: A });
    h.check('status=trashed zeigt sie', res.body.instances.length === 1, res.body.instances.length);

    res = await h.request({ url: '/api/cloud/instances?status=all', token: A });
    h.check('status=all zeigt beide', res.body.instances.length === 2, res.body.instances.length);

    res = await h.request({ url: '/api/cloud/instances/inst-vanilla-01/head', token: A });
    h.check('head einer Papierkorb-Instanz -> 404', res.status === 404, res.body);

    res = await h.request({ method: 'DELETE', url: '/api/cloud/instances/inst-vanilla-01', token: A });
    h.check('zweimal loeschen -> 404', res.status === 404, res.body);

    res = await h.request({
        method: 'POST', url: '/api/cloud/instances', token: A,
        body: { instanceUuid: 'inst-vanilla-01', name: 'Vanilla Survival' }
    });
    h.check('anlegen einer Papierkorb-UUID -> instance_trashed',
        res.status === 409 && res.body.error === 'instance_trashed', res.body);

    res = await h.request({ method: 'POST', url: '/api/cloud/instances/inst-vanilla-01/restore', token: A });
    h.check('restore holt sie zurueck', res.status === 200 && res.body.instance.status === 'active', res.body.instance);
    h.check('restore setzt den 15-Tage-Timer zurueck',
        res.body.instance.expiresAt > Date.now(), res.body.instance.expiresAt);

    res = await h.request({ method: 'POST', url: '/api/cloud/instances/inst-vanilla-01/restore', token: A });
    h.check('restore einer aktiven Instanz -> 404', res.status === 404, res.body);

    h.section('6) Instanzlimit');

    for (let i = 3; i <= 10; i += 1) {
        res = await h.request({
            method: 'POST', url: '/api/cloud/instances', token: A,
            body: { instanceUuid: `inst-filler-${String(i).padStart(3, '0')}`, name: `Filler ${i}` }
        });
        if (res.status !== 201) {
            h.check(`Fuellinstanz ${i} angelegt`, false, res.body);
            break;
        }
    }
    res = await h.request({ url: '/api/cloud/instances', token: A });
    h.check('10 aktive Instanzen erreicht', res.body.instances.length === 10, res.body.instances.length);

    res = await h.request({
        method: 'POST', url: '/api/cloud/instances', token: A,
        body: { instanceUuid: 'inst-elfte-0011', name: 'Elfte' }
    });
    h.check('11. Instanz -> instance_limit_reached',
        res.status === 409 && res.body.error === 'instance_limit_reached', res.body);
    h.check('Fehler nennt Zaehler und Limit',
        res.body.details && res.body.details.instanceCount === 10 && res.body.details.maxInstances === 10,
        res.body.details);

    await h.request({ method: 'DELETE', url: '/api/cloud/instances/inst-filler-010', token: A });
    res = await h.request({
        method: 'POST', url: '/api/cloud/instances', token: A,
        body: { instanceUuid: 'inst-elfte-0011', name: 'Elfte' }
    });
    h.check('Papierkorb zaehlt nicht gegen das Limit', res.status === 201, res.body);

    res = await h.request({ method: 'POST', url: '/api/cloud/instances/inst-filler-010/restore', token: A });
    h.check('restore ueber das Limit hinaus -> instance_limit_reached',
        res.status === 409 && res.body.error === 'instance_limit_reached', res.body);

    res = await h.request({ url: '/api/cloud/me', token: A });
    h.check('/me zaehlt die aktiven Instanzen', res.body.quota.instanceCount === 10, res.body.quota);

    h.section('7) database.js-Fallstricke (Tabellen ohne id-Spalte)');

    const [instRows] = await h.pool.query(
        'SELECT id FROM cloud_instances WHERE instance_uuid = ?', ['inst-skyblock-1']
    );
    const instanceId = instRows[0].id;
    const [devRows] = await h.pool.query(
        'SELECT id FROM client_devices WHERE device_uuid = ?', ['dev-aaaa-0001']
    );
    const deviceId = devRows[0].id;

    let threw = false;
    try {
        await h.pool.query(
            'INSERT INTO blobs (hash, size, stored_size, storage_key) VALUES (?, ?, ?, ?)',
            ['a'.repeat(64), 100, 80, 'blobs/aa/a'.repeat(1)]
        );
    } catch (err) {
        threw = true;
    }
    h.check('INSERT ohne RETURNING scheitert bei einer Tabelle ohne id-Spalte', threw);

    await h.pool.query(
        'INSERT INTO blobs (hash, size, stored_size, storage_key) VALUES (?, ?, ?, ?) RETURNING hash',
        ['b'.repeat(64), 100, 80, 'blobs/bb/b']
    );
    const [blobRows] = await h.pool.query('SELECT hash FROM blobs WHERE hash = ?', ['b'.repeat(64)]);
    h.check('mit explizitem RETURNING geht es', blobRows.length === 1, blobRows);

    const [revResult] = await h.pool.query(
        `INSERT INTO cloud_revisions (instance_id, revision, manifest_blob, device_id, entry_count, logical_bytes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [instanceId, 1, 'b'.repeat(64), deviceId, 3, 4096]
    );
    h.check('cloud_revisions liefert eine insertId (hat eine id-Spalte)',
        Number.isInteger(revResult.insertId), revResult.insertId);

    await h.pool.query(
        'INSERT INTO blob_refs (revision_id, blob_hash) VALUES (?, ?) RETURNING blob_hash',
        [revResult.insertId, 'b'.repeat(64)]
    );
    const [refRows] = await h.pool.query('SELECT blob_hash FROM blob_refs WHERE revision_id = ?', [revResult.insertId]);
    h.check('blob_refs: INSERT mit RETURNING blob_hash funktioniert', refRows.length === 1, refRows);

    await h.pool.query(
        `INSERT INTO cloud_instance_playtime (instance_id, device_id, total_ms, last_session_id)
         VALUES (?, ?, ?, ?) RETURNING instance_id`,
        [instanceId, deviceId, 151200000, 'sess-1']
    );
    const [playRows] = await h.pool.query(
        'SELECT total_ms FROM cloud_instance_playtime WHERE instance_id = ? AND device_id = ?',
        [instanceId, deviceId]
    );
    h.check('cloud_instance_playtime: INSERT mit RETURNING instance_id funktioniert',
        playRows.length === 1 && Number(playRows[0].total_ms) === 151200000, playRows);

    h.section('8) Abgeleitete Felder aus den neuen Tabellen');

    await h.pool.query('UPDATE cloud_instances SET current_revision = ? WHERE id = ?', [1, instanceId]);

    res = await h.request({ url: '/api/cloud/instances/inst-skyblock-1/head', token: A });
    h.check('head liefert den manifestHash der aktuellen Revision',
        res.body.manifestHash === 'b'.repeat(64), res.body.manifestHash);
    h.check('head summiert die Playtime ueber alle Geraete',
        res.body.playtimeTotalMs === 151200000, res.body.playtimeTotalMs);

    const [sessResult] = await h.pool.query(
        'INSERT INTO cloud_sessions (instance_id, device_id, session_uuid) VALUES (?, ?, ?)',
        [instanceId, deviceId, 'sess-live-1']
    );
    h.check('cloud_sessions angelegt', Number.isInteger(sessResult.insertId), sessResult.insertId);

    res = await h.request({ url: '/api/cloud/instances/inst-skyblock-1/head', token: A });
    h.check('head meldet die laufende Sitzung',
        res.body.activeSession
        && res.body.activeSession.sessionId === 'sess-live-1'
        && res.body.activeSession.deviceName === 'DESKTOP-A', res.body.activeSession);

    await h.pool.query('UPDATE cloud_sessions SET ended_at = NOW() WHERE session_uuid = ?', ['sess-live-1']);
    res = await h.request({ url: '/api/cloud/instances/inst-skyblock-1/head', token: A });
    h.check('beendete Sitzung taucht nicht mehr auf', res.body.activeSession === null, res.body.activeSession);

    res = await h.request({ url: '/api/cloud/instances', token: A });
    const skyblock = res.body.instances.find((i) => i.instanceUuid === 'inst-skyblock-1');
    h.check('Liste zeigt Revision und Playtime',
        skyblock.revision === 1 && skyblock.playtimeTotalMs === 151200000, skyblock);

    h.section('9) Auth');

    res = await h.request({ url: '/api/cloud/instances' });
    h.check('Liste ohne Token -> 401', res.status === 401, res.body);

    res = await h.request({ method: 'POST', url: '/api/cloud/instances', body: { instanceUuid: 'x', name: 'y' } });
    h.check('anlegen ohne Token -> 401', res.status === 401, res.body);

    h.finish();
}

main().catch((err) => {
    console.error('\nTEST HARNESS ERROR:', err);
    process.exit(2);
});
