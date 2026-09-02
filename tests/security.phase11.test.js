const crypto = require('crypto');

const { Harness, pkce, base64Url } = require('./luxcloudHarness');

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

function entryFor(path, buffer) {
    const hash = sha256(buffer);
    return { path, size: buffer.length, mtime: 1, sha256: hash, blob: hash };
}

function manifestFor(uuid, entries, extra = {}) {
    return {
        manifestVersion: 1,
        instanceId: uuid,
        name: 'Target',
        createdAt: 1756582980000,
        entries,
        ...extra
    };
}

const NUL = String.fromCharCode(0);
const BACKSLASH = String.fromCharCode(92);

async function main() {
    await h.start();

    const victim = await h.createUser({ googleId: 'g-sec-v', username: 'opfer' });
    const attacker = await h.createUser({ googleId: 'g-sec-a', username: 'angreifer' });

    const victimSession = { id: victim, username: 'opfer', role: 'user', banned: false };
    const attackerSession = { id: attacker, username: 'angreifer', role: 'user', banned: false };

    const V = (await h.authorizeDevice({ user: victimSession, deviceUuid: 'dev-sec-v1' })).accessToken;
    const attackerTokens = await h.authorizeDevice({ user: attackerSession, deviceUuid: 'dev-sec-a1', platform: 'linux' });
    const A = attackerTokens.accessToken;

    const VICTIM_UUID = 'inst-sec-opfer';
    const ATTACKER_UUID = 'inst-sec-angreifer';

    const secret = Buffer.from('GEHEIME WELTDATEN DES OPFERS', 'utf8');
    const secretHash = sha256(secret);

    await h.request({
        method: 'POST', url: '/api/cloud/instances', token: V,
        body: { instanceUuid: VICTIM_UUID, name: 'Opfer' }
    });
    await uploadBlob(V, secret);
    await h.request({
        method: 'POST', url: `/api/cloud/instances/${VICTIM_UUID}/commit`, token: V,
        body: { manifest: manifestFor(VICTIM_UUID, [entryFor('config/secret.json', secret)], { name: 'Opfer' }), parentRevision: 0 }
    });

    await h.request({
        method: 'POST', url: '/api/cloud/instances', token: A,
        body: { instanceUuid: ATTACKER_UUID, name: 'Angreifer' }
    });

    let res;

    h.section('1) IDOR - fremde Instanz erreichen');

    const victimEndpoints = [
        ['GET', `/api/cloud/instances/${VICTIM_UUID}/head`],
        ['GET', `/api/cloud/instances/${VICTIM_UUID}/manifest`],
        ['GET', `/api/cloud/instances/${VICTIM_UUID}/revisions`],
        ['GET', `/api/cloud/instances/${VICTIM_UUID}/playtime`],
        ['POST', `/api/cloud/instances/${VICTIM_UUID}/negotiate`],
        ['POST', `/api/cloud/instances/${VICTIM_UUID}/session`],
        ['PATCH', `/api/cloud/instances/${VICTIM_UUID}`],
        ['DELETE', `/api/cloud/instances/${VICTIM_UUID}`]
    ];

    let leaks = 0;
    for (const [method, url] of victimEndpoints) {
        res = await h.request({ method, url, token: A, body: method === 'GET' ? undefined : { blobs: [] } });
        if (res.status !== 404 && res.status !== 400) leaks += 1;
    }
    h.check('kein Endpunkt gibt eine fremde Instanz preis', leaks === 0, { leaks });

    res = await h.request({ method: 'GET', url: '/api/cloud/instances', token: A });
    h.check('die Instanzliste zeigt nur eigene',
        res.body.instances.every((entry) => entry.instanceUuid === ATTACKER_UUID), res.body.instances);

    h.section('2) Blob-Zugriff ueber geratenen Hash');

    res = await h.request({ method: 'GET', url: `/api/cloud/blobs/${secretHash}`, token: A });
    h.check('ein fremder Blob ist nicht lesbar', res.status === 404, res.status);

    res = await h.request({ method: 'GET', url: `/api/cloud/blobs/${secretHash}/head`, token: A });
    h.check('auch der Kopf verraet nichts', res.status === 404, res.status);

    res = await h.request({
        method: 'POST', url: `/api/cloud/instances/${ATTACKER_UUID}/commit`, token: A,
        body: {
            manifest: manifestFor(ATTACKER_UUID, [entryFor('config/secret.json', secret)], { name: 'Angreifer' }),
            parentRevision: 0
        }
    });
    h.check('ein fremder Blob laesst sich nicht ins eigene Manifest legen',
        res.status === 403 && res.body.error === 'forbidden', res.body);

    const [stillNoRevision] = await h.pool.query(
        `SELECT COUNT(*) AS count FROM cloud_revisions r
           JOIN cloud_instances i ON i.id = r.instance_id
          WHERE i.instance_uuid = ?`,
        [ATTACKER_UUID]
    );
    h.check('und hinterlaesst keine Revision', Number(stillNoRevision[0].count) === 0, stillNoRevision[0]);

    res = await h.request({ method: 'GET', url: `/api/cloud/blobs/${secretHash}`, token: A });
    h.check('nach dem Versuch ist er weiterhin nicht lesbar', res.status === 404, res.status);

    h.section('3) Pfad-Angriffe im Manifest');

    const ownFile = Buffer.from('harmlos', 'utf8');
    await uploadBlob(A, ownFile);

    const badPaths = [
        '../../etc/passwd',
        '..' + BACKSLASH + '..' + BACKSLASH + 'windows' + BACKSLASH + 'system32',
        '/etc/shadow',
        'C:/Windows/System32/drivers/etc/hosts',
        'config/../../escape.txt',
        'mods/' + NUL + 'nul.jar',
        'CON',
        'mods/CON.jar',
        'config/trailing. ',
        'a/'.repeat(40) + 'deep.txt',
        '',
        '.',
        '..'
    ];

    let accepted = 0;
    for (const path of badPaths) {
        const entry = { ...entryFor('x', ownFile), path };
        res = await h.request({
            method: 'POST', url: `/api/cloud/instances/${ATTACKER_UUID}/commit`, token: A,
            body: { manifest: manifestFor(ATTACKER_UUID, [entry], { name: 'Angreifer' }), parentRevision: 0 }
        });
        if (res.status === 201) accepted += 1;
    }
    h.check(`alle ${badPaths.length} Pfad-Angriffe werden abgewiesen`, accepted === 0, { accepted });

    res = await h.request({
        method: 'POST', url: `/api/cloud/instances/${ATTACKER_UUID}/commit`, token: A,
        body: {
            manifest: manifestFor(ATTACKER_UUID, [
                entryFor('config/a.json', ownFile),
                entryFor('config/a.json', ownFile)
            ], { name: 'Angreifer' }),
            parentRevision: 0
        }
    });
    h.check('doppelte Pfade werden abgewiesen', res.status === 422, res.body);

    h.section('4) Quota und Limits');

    const big = Buffer.alloc(64 * 1024, 9);
    await uploadBlob(A, big);

    const lying = { ...entryFor('config/big.bin', big), size: 1 };
    res = await h.request({
        method: 'POST', url: `/api/cloud/instances/${ATTACKER_UUID}/commit`, token: A,
        body: { manifest: manifestFor(ATTACKER_UUID, [lying], { name: 'Angreifer' }), parentRevision: 0 }
    });

    if (res.status === 201) {
        const [row] = await h.pool.query(
            'SELECT logical_bytes FROM cloud_instances WHERE instance_uuid = ?', [ATTACKER_UUID]
        );
        h.check('eine gefaelschte Groessenangabe wird nicht geglaubt',
            Number(row[0].logical_bytes) >= big.length, {
                declared: 1,
                actual: big.length,
                stored: Number(row[0].logical_bytes)
            });
    } else {
        h.check('eine gefaelschte Groessenangabe wird abgewiesen', true, res.body);
    }

    await h.pool.query('UPDATE user_cloud_settings SET max_instances = ? WHERE user_id = ?', [2, attacker]);

    res = await h.request({
        method: 'POST', url: '/api/cloud/instances', token: A,
        body: { instanceUuid: 'inst-sec-zwei', name: 'Zwei' }
    });
    h.check('bis zum Limit geht es', res.status === 201 || res.status === 200, res.status);

    res = await h.request({
        method: 'POST', url: '/api/cloud/instances', token: A,
        body: { instanceUuid: 'inst-sec-drei', name: 'Drei' }
    });
    h.check('darueber nicht', res.status === 409 && res.body.error === 'instance_limit_reached', res.body);

    await h.request({ method: 'DELETE', url: '/api/cloud/instances/inst-sec-zwei', token: A });
    res = await h.request({
        method: 'POST', url: '/api/cloud/instances', token: A,
        body: { instanceUuid: 'inst-sec-drei', name: 'Drei' }
    });
    h.check('der Papierkorb schafft Platz, ohne das Limit zu umgehen',
        res.status === 201 || res.status === 200, res.body);

    res = await h.request({ method: 'POST', url: '/api/cloud/instances/inst-sec-zwei/restore', token: A });
    h.check('das Wiederherstellen prueft das Limit erneut',
        res.status === 409 && res.body.error === 'instance_limit_reached', res.body);

    h.section('5) Blob-Uploads');

    const payload = Buffer.from('inhalt', 'utf8');
    res = await h.request({
        method: 'PUT', url: `/api/cloud/blobs/${sha256(Buffer.from('etwas anderes'))}`,
        token: A, body: payload, headers: { 'X-Lux-Compression': 'none' }
    });
    h.check('ein falscher Hash wird erkannt', res.status === 400, res.body);

    res = await h.request({
        method: 'PUT', url: '/api/cloud/blobs/../../../etc/passwd',
        token: A, body: payload
    });
    h.check('Traversal im Blob-Pfad greift nicht', res.status === 400 || res.status === 404, res.status);

    res = await h.request({
        method: 'PUT', url: `/api/cloud/blobs/${sha256(payload)}`,
        token: A, body: payload, headers: { 'X-Lux-Compression': 'gzip' }
    });
    h.check('eine unbekannte Kompression wird abgewiesen', res.status === 400, res.body);

    h.section('6) Tokens');

    res = await h.request({ method: 'GET', url: '/api/cloud/me' });
    h.check('ohne Token kein Zugriff', res.status === 401, res.status);

    res = await h.request({ method: 'GET', url: '/api/cloud/me', token: 'nicht.ein.jwt' });
    h.check('ein erfundenes Token wird abgewiesen', res.status === 401, res.status);

    const parts = String(A).split('.');
    const tampered = `${parts[0]}.${base64Url(Buffer.from(JSON.stringify({ sub: victim, dev: 'dev-sec-v1', gen: 1 })))}.${parts[2]}`;
    res = await h.request({ method: 'GET', url: '/api/cloud/me', token: tampered });
    h.check('ein manipuliertes Token wird abgewiesen', res.status === 401, res.status);

    const throwaway = await h.authorizeDevice({ user: attackerSession, deviceUuid: 'dev-sec-a2', deviceName: 'WEGWERF' });
    const refresh = throwaway.refreshToken;
    const rotated = await h.request({
        method: 'POST', url: '/api/auth/device/refresh',
        body: { refresh_token: refresh, device_uuid: 'dev-sec-a2' }
    });
    h.check('der Refresh rotiert', rotated.status === 200 && rotated.body.refreshToken !== refresh, rotated.status);

    await h.request({
        method: 'POST', url: '/api/auth/device/refresh',
        body: { refresh_token: rotated.body.refreshToken, device_uuid: 'dev-sec-a2' }
    });

    res = await h.request({
        method: 'POST', url: '/api/auth/device/refresh',
        body: { refresh_token: refresh, device_uuid: 'dev-sec-a2' }
    });
    h.check('ein zweimal verbrauchter Refresh wird abgewiesen', res.status >= 400, res.status);

    h.section('7) Sitzungen');

    const own = await h.request({ method: 'POST', url: `/api/cloud/instances/${ATTACKER_UUID}/session`, token: A });
    const victimSessionRes = await h.request({ method: 'POST', url: `/api/cloud/instances/${VICTIM_UUID}/session`, token: V });

    res = await h.request({
        method: 'POST', url: `/api/cloud/sessions/${victimSessionRes.body.sessionId}/heartbeat`, token: A
    });
    h.check('eine fremde Sitzung laesst sich nicht am Leben halten', res.status === 404, res.status);

    res = await h.request({
        method: 'POST', url: `/api/cloud/sessions/${victimSessionRes.body.sessionId}/end`, token: A
    });
    h.check('und nicht beenden', res.status === 404, res.status);

    const [victimStillRunning] = await h.pool.query(
        'SELECT ended_at FROM cloud_sessions WHERE session_uuid = ?', [victimSessionRes.body.sessionId]
    );
    h.check('sie laeuft weiter', victimStillRunning[0].ended_at === null, victimStillRunning[0]);
    h.check('die eigene Sitzung funktioniert', own.status === 201, own.status);

    h.section('8) Playtime');

    res = await h.request({
        method: 'PUT', url: `/api/cloud/instances/${VICTIM_UUID}/playtime`, token: A,
        body: { deviceTotalMs: 1000 }
    });
    h.check('fremde Playtime laesst sich nicht setzen', res.status === 404, res.status);

    h.section('9) Admin-Endpunkte');

    const adminPaths = ['/stats', '/users', '/gc', '/expiry', '/instances?userId=1'];
    let adminLeaks = 0;
    for (const path of adminPaths) {
        res = await h.request({ method: 'GET', url: `/api/admin/cloud${path}`, token: A });
        if (res.status !== 403) adminLeaks += 1;
    }
    h.check('kein Admin-Endpunkt antwortet einem normalen Konto', adminLeaks === 0, { adminLeaks });

    h.setSessionUser(attackerSession);
    res = await h.request({ method: 'GET', url: '/api/admin/cloud/stats' });
    h.check('auch nicht mit Website-Sitzung ohne Adminrolle', res.status === 403, res.status);

    res = await h.request({
        method: 'PATCH', url: `/api/admin/cloud/users/${attacker}/quota`,
        body: { quotaBytes: 999999999999 }
    });
    h.check('die eigene Quota laesst sich nicht anheben', res.status === 403, res.status);
    h.setSessionUser(null);

    h.section('10) Kontogrenzen bei geloeschtem Geraet');

    const [devices] = await h.pool.query(
        'SELECT device_uuid FROM client_devices WHERE user_id = ? AND device_uuid = ?',
        [attacker, 'dev-sec-a1']
    );
    await h.request({
        method: 'DELETE', url: `/api/cloud/devices/${devices[0].device_uuid}`, token: A
    });

    res = await h.request({ method: 'GET', url: '/api/cloud/me', token: A });
    h.check('ein abgemeldetes Geraet verliert sofort den Zugriff',
        res.status === 401 || res.status === 403, res.status);

    h.finish();
}

main().catch((err) => {
    console.error(err);
    h.stop();
    process.exit(1);
});
