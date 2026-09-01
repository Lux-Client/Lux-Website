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

function manifestFor(uuid, buffer, name = 'Skyblock') {
    const hash = sha256(buffer);
    return {
        manifestVersion: 1,
        instanceId: uuid,
        name,
        createdAt: 1756582980000,
        entries: [{ path: 'config/a.json', size: buffer.length, mtime: 1, sha256: hash, blob: hash }]
    };
}

async function createAndCommit(token, uuid, buffer, name) {
    await h.request({
        method: 'POST', url: '/api/cloud/instances', token,
        body: { instanceUuid: uuid, name }
    });
    await uploadBlob(token, buffer);
    const res = await h.request({
        method: 'POST', url: `/api/cloud/instances/${uuid}/commit`, token,
        body: { manifest: manifestFor(uuid, buffer, name), parentRevision: 0 }
    });
    if (res.status !== 201) throw new Error(`commit failed: ${JSON.stringify(res.body)}`);
    return res.body;
}

async function ageInstance(uuid, days) {
    await h.pool.query(
        `UPDATE cloud_instances
            SET created_at = NOW() - INTERVAL '${days} days',
                last_foreign_pull_at = CASE WHEN last_foreign_pull_at IS NULL THEN NULL
                                            ELSE NOW() - INTERVAL '${days} days' END
          WHERE instance_uuid = ?`,
        [uuid]
    );
}

async function statusOf(uuid) {
    const [rows] = await h.pool.query(
        'SELECT status, last_foreign_pull_at, expiry_warned_at, final_warned_at FROM cloud_instances WHERE instance_uuid = ?',
        [uuid]
    );
    return rows[0];
}

async function main() {
    await h.start();

    const { runExpiry } = require('../jobs/cloudExpiry');
    const { purgeCloudData, purgeEverything } = require('../cloudAccount');

    const userA = await h.createUser({ googleId: 'g-p10a', username: 'beatv', email: 'a@example.com' });
    const userB = await h.createUser({ googleId: 'g-p10b', username: 'zweiter', email: 'b@example.com' });
    const admin = await h.createUser({ googleId: 'g-p10adm', username: 'root' });
    await h.pool.query('UPDATE users SET role = ? WHERE id = ?', ['admin', admin]);

    const sessionA = { id: userA, username: 'beatv', role: 'user', banned: false };
    const PC1 = (await h.authorizeDevice({ user: sessionA, deviceUuid: 'dev-p10-pc1' })).accessToken;
    const PC2 = (await h.authorizeDevice({ user: sessionA, deviceUuid: 'dev-p10-pc2', deviceName: 'LAPTOP' })).accessToken;

    const payload = Buffer.from('{"fov":90}', 'utf8');
    let res;

    h.section('1) Die 15-Tage-Regel gilt woertlich');

    const NIE = 'inst-p10-nie-gezogen';
    await createAndCommit(PC1, NIE, payload, 'Nie gezogen');

    res = await h.request({ method: 'GET', url: `/api/cloud/instances/${NIE}/head`, token: PC1 });
    h.check('eine frische Instanz gilt als nie anderswo gezogen',
        res.body.everPulledElsewhere === false, res.body);

    await h.request({ method: 'GET', url: `/api/cloud/instances/${NIE}/manifest?touch=1`, token: PC1 });
    h.check('der eigene PC zaehlt nicht als Fremdzugriff',
        (await statusOf(NIE)).last_foreign_pull_at === null, await statusOf(NIE));

    await h.request({
        method: 'PUT', url: `/api/cloud/instances/${NIE}/playtime`, token: PC1,
        body: { deviceTotalMs: 3600000 }
    });
    h.check('auch Spielzeit vom eigenen PC nicht',
        (await statusOf(NIE)).last_foreign_pull_at === null, await statusOf(NIE));

    await h.request({ method: 'POST', url: `/api/cloud/instances/${NIE}/session`, token: PC1 });
    h.check('und auch eine Sitzung vom eigenen PC nicht',
        (await statusOf(NIE)).last_foreign_pull_at === null, await statusOf(NIE));

    h.section('2) Ein zweiter PC setzt den Zaehler zurueck');

    const GEZOGEN = 'inst-p10-gezogen';
    await createAndCommit(PC1, GEZOGEN, payload, 'Gezogen');

    await h.request({ method: 'GET', url: `/api/cloud/instances/${GEZOGEN}/manifest?touch=1`, token: PC2 });
    const pulled = await statusOf(GEZOGEN);
    h.check('ein Pull vom zweiten PC zaehlt', pulled.last_foreign_pull_at !== null, pulled);

    res = await h.request({ method: 'GET', url: `/api/cloud/instances/${GEZOGEN}/head`, token: PC1 });
    h.check('head meldet das auch', res.body.everPulledElsewhere === true, res.body);

    h.section('3) Warnungen und Loeschung');

    await ageInstance(NIE, 9);
    let result = await runExpiry({ dryRun: false });
    h.check('nach 9 Tagen wird gewarnt', result.warned >= 1, result);
    h.check('aber noch nicht geloescht', (await statusOf(NIE)).status === 'active', await statusOf(NIE));

    let [notes] = await h.pool.query('SELECT message FROM notifications WHERE user_id = ?', [userA]);
    h.check('der Nutzer bekommt eine Benachrichtigung', notes.length === 1, notes);
    h.check('sie nennt die Instanz', notes[0].message.includes('Nie gezogen'), notes[0].message);
    h.check('sie stellt klar dass lokale Dateien bleiben',
        notes[0].message.includes('local files'), notes[0].message);

    result = await runExpiry({ dryRun: false });
    h.check('ein zweiter Lauf warnt nicht erneut', result.warned === 0, result);

    await ageInstance(NIE, 13);
    result = await runExpiry({ dryRun: false });
    h.check('nach 13 Tagen kommt die zweite Warnung', result.finalWarned >= 1, result);

    await ageInstance(NIE, 16);
    result = await runExpiry({ dryRun: false });
    h.check('nach 16 Tagen wandert sie in den Papierkorb', result.trashed === 1, result);
    h.check('der Status stimmt', (await statusOf(NIE)).status === 'trashed', await statusOf(NIE));

    [notes] = await h.pool.query('SELECT message FROM notifications WHERE user_id = ? ORDER BY id DESC', [userA]);
    h.check('auch die Loeschung wird gemeldet',
        notes[0].message.includes('removed from the Lux Cloud'), notes[0].message);

    h.section('4) Die gezogene Instanz ueberlebt');

    h.check('sie ist weiterhin aktiv', (await statusOf(GEZOGEN)).status === 'active', await statusOf(GEZOGEN));

    await ageInstance(GEZOGEN, 16);
    result = await runExpiry({ dryRun: false });
    h.check('erst 16 Tage nach dem letzten Fremdzugriff faellt auch sie',
        (await statusOf(GEZOGEN)).status === 'trashed', await statusOf(GEZOGEN));

    h.section('5) Trockenlauf loescht nichts');

    const DRY = 'inst-p10-dry';
    await createAndCommit(PC1, DRY, payload, 'Trocken');
    await ageInstance(DRY, 20);

    result = await runExpiry({ dryRun: true });
    h.check('der Trockenlauf meldet die Loeschung', result.trashed >= 1, result);
    h.check('fuehrt sie aber nicht aus', (await statusOf(DRY)).status === 'active', await statusOf(DRY));

    h.section('6) Papierkorb wird nach Frist geleert');

    await h.pool.query(
        `UPDATE cloud_instances SET trashed_at = NOW() - INTERVAL '60 days' WHERE instance_uuid = ?`,
        [NIE]
    );
    result = await runExpiry({ dryRun: false });
    h.check('nach 60 Tagen im Papierkorb ist sie weg', result.purged >= 1, result);

    const [gone] = await h.pool.query('SELECT id FROM cloud_instances WHERE instance_uuid = ?', [NIE]);
    h.check('die Zeile existiert nicht mehr', gone.length === 0, gone);

    h.section('7) Cloud-Daten loeschen');

    const CLEAN = 'inst-p10-clean';
    await createAndCommit(PC1, CLEAN, Buffer.from('{"x":1}', 'utf8'), 'Aufraeumen');

    h.setSessionUser(sessionA);
    res = await h.request({ method: 'DELETE', url: '/api/cloud/me', body: {} });
    h.check('ohne Bestaetigung passiert nichts', res.status === 400, res.body);

    res = await h.request({
        method: 'DELETE', url: '/api/cloud/me',
        body: { confirm: 'delete-my-cloud-data' }
    });
    h.check('mit Bestaetigung wird geloescht', res.status === 200 && res.body.ok === true, res.body);
    h.check('die Antwort stellt lokale Dateien klar',
        String(res.body.note).includes('untouched'), res.body.note);
    h.setSessionUser(null);

    const [remaining] = await h.pool.query('SELECT COUNT(*) AS count FROM cloud_instances WHERE user_id = ?', [userA]);
    h.check('keine Cloud-Instanz bleibt uebrig', Number(remaining[0].count) === 0, remaining[0]);

    const [usage] = await h.pool.query('SELECT used_bytes FROM user_cloud_settings WHERE user_id = ?', [userA]);
    h.check('der Verbrauch steht auf 0', Number(usage[0].used_bytes) === 0, usage[0]);

    const [orphans] = await h.pool.query('SELECT COUNT(*) AS count FROM blobs WHERE refcount > 0');
    h.check('kein Blob bleibt faelschlich referenziert', Number(orphans[0].count) === 0, orphans[0]);

    const [devices] = await h.pool.query('SELECT COUNT(*) AS count FROM client_devices WHERE user_id = ?', [userA]);
    h.check('die Geraete bleiben angemeldet', Number(devices[0].count) === 2, devices[0]);

    h.section('8) Konto loeschen');

    const B1 = (await h.authorizeDevice({
        user: { id: userB, username: 'zweiter', role: 'user', banned: false },
        deviceUuid: 'dev-p10-b1'
    })).accessToken;

    const BINST = 'inst-p10-b';
    await createAndCommit(B1, BINST, Buffer.from('{"b":1}', 'utf8'), 'Konto B');

    const purged = await purgeEverything(userB);
    h.check('alle Instanzen sind weg', purged.instances === 1, purged);
    h.check('die Geraete sind revoziert', purged.devicesRevoked >= 1, purged);

    const [bDevices] = await h.pool.query('SELECT COUNT(*) AS count FROM client_devices WHERE user_id = ?', [userB]);
    h.check('und geloescht', Number(bDevices[0].count) === 0, bDevices[0]);

    res = await h.request({ method: 'GET', url: '/api/cloud/me', token: B1 });
    h.check('das Token wirkt nicht mehr', res.status === 401 || res.status === 403, res.status);

    const [allRefs] = await h.pool.query('SELECT COUNT(*) AS count FROM blob_refs');
    h.check('es bleiben keine Blob-Referenzen zurueck', Number(allRefs[0].count) === 0, allRefs[0]);

    h.section('9) Admin');

    h.setSessionUser({ id: admin, username: 'root', role: 'admin', banned: false });

    res = await h.request({ method: 'GET', url: '/api/admin/cloud/stats' });
    h.check('die Statistik antwortet', res.status === 200, res.body);
    h.check('sie zaehlt Instanzen ohne Fremdzugriff',
        Number.isFinite(res.body.instances.neverPulledElsewhere), res.body.instances);

    res = await h.request({ method: 'GET', url: '/api/admin/cloud/users' });
    h.check('die Nutzerliste antwortet', res.status === 200 && Array.isArray(res.body.users), res.body);

    res = await h.request({
        method: 'PATCH', url: `/api/admin/cloud/users/${userA}/quota`,
        body: { quotaBytes: 10 * 1024 * 1024 * 1024, maxInstances: 20 }
    });
    h.check('die Quota laesst sich anheben', res.status === 200, res.body);

    const [newQuota] = await h.pool.query('SELECT quota_bytes, max_instances FROM user_cloud_settings WHERE user_id = ?', [userA]);
    h.check('und ist gespeichert', Number(newQuota[0].max_instances) === 20, newQuota[0]);

    const [audit] = await h.pool.query('SELECT action FROM admin_audit_log ORDER BY id DESC');
    h.check('die Aenderung steht im Audit-Log',
        audit.length > 0 && audit[0].action === 'cloud_quota_change', audit[0]);

    res = await h.request({ method: 'GET', url: '/api/admin/cloud/expiry' });
    h.check('der Job-Status ist abrufbar', res.status === 200 && res.body.expiry, res.body);
    h.check('er nennt die Regel in Worten',
        String(res.body.expiry.policy.rule).includes('other than'), res.body.expiry.policy);

    h.setSessionUser(null);
    res = await h.request({ method: 'GET', url: '/api/admin/cloud/stats' });
    h.check('ohne Admin kein Zugriff', res.status === 403, res.status);

    h.finish();
}

main().catch((err) => {
    console.error(err);
    h.stop();
    process.exit(1);
});
