const crypto = require('crypto');

const { Harness, pkce } = require('./luxcloudHarness');

const h = new Harness();

async function main() {
    await h.start();

    const userId = await h.createUser({ googleId: 'g-pair-1', username: 'beatv', email: 'a@example.com' });
    const other = await h.createUser({ googleId: 'g-pair-2', username: 'fremd' });
    const admin = await h.createUser({ googleId: 'g-pair-adm', username: 'root' });
    await h.pool.query('UPDATE users SET role = ? WHERE id = ?', ['admin', admin]);

    const session = { id: userId, username: 'beatv', role: 'user', banned: false, cloud_banned: false };
    let res;

    h.section('1) Kopplungscode anfordern');

    const pair = pkce();
    res = await h.request({
        method: 'POST', url: '/api/auth/device/pair/start',
        body: { code_challenge: pair.challenge, device_name: 'Max', platform: 'win32' }
    });
    h.check('der Start liefert einen Code', res.status === 201, res.body);
    h.check('der Code hat 6 Zeichen', String(res.body.userCode).length === 6, res.body.userCode);
    h.check('ohne mehrdeutige Zeichen',
        !/[01OIL]/.test(res.body.userCode), res.body.userCode);
    h.check('dazu ein geheimer device_code', String(res.body.deviceCode).length >= 40, null);
    h.check('und eine Adresse zum Eingeben',
        String(res.body.verificationUri).endsWith('/link'), res.body.verificationUri);

    const { userCode, deviceCode } = res.body;

    res = await h.request({
        method: 'POST', url: '/api/auth/device/pair/start',
        body: { code_challenge: 'zu-kurz', platform: 'win32' }
    });
    h.check('eine kaputte Challenge wird abgewiesen', res.status === 400, res.body);

    h.section('2) Vor der Freigabe gibt es nichts');

    res = await h.request({
        method: 'POST', url: '/api/auth/device/pair/poll',
        body: { device_code: deviceCode, code_verifier: pair.verifier, device_uuid: 'dev-pair-1' }
    });
    h.check('das Abfragen meldet authorization_pending',
        res.status === 202 && res.body.error === 'authorization_pending', res.body);

    res = await h.request({
        method: 'POST', url: '/api/auth/device/pair/poll',
        body: { device_code: 'erfunden', code_verifier: pair.verifier, device_uuid: 'dev-pair-1' }
    });
    h.check('ein erfundener device_code wird abgewiesen', res.status === 400, res.body);

    h.section('3) Freigabe auf der Website');

    res = await h.request({ method: 'GET', url: `/api/auth/device/pair/lookup?code=${userCode}` });
    h.check('ohne Anmeldung kein Nachschlagen', res.status === 401, res.status);

    h.setSessionUser(session);

    res = await h.request({ method: 'GET', url: `/api/auth/device/pair/lookup?code=${userCode}` });
    h.check('angemeldet zeigt der Code das Geraet', res.status === 200 && res.body.deviceName === 'Max', res.body);
    h.check('und die Plattform', res.body.platform === 'win32', res.body);

    res = await h.request({ method: 'GET', url: '/api/auth/device/pair/lookup?code=ZZZZZZ' });
    h.check('ein unbekannter Code gibt 404', res.status === 404, res.body);

    res = await h.request({ method: 'GET', url: '/api/auth/device/pair/lookup?code=0OIL11' });
    h.check('ein Code mit verbotenen Zeichen gibt 400', res.status === 400, res.body);

    res = await h.request({
        method: 'POST', url: '/api/auth/device/pair/approve',
        body: { code: userCode.toLowerCase() }
    });
    h.check('Kleinschreibung wird akzeptiert', res.status === 200, res.body);

    h.setSessionUser(null);

    h.section('4) Nach der Freigabe kommen die Tokens');

    res = await h.request({
        method: 'POST', url: '/api/auth/device/pair/poll',
        body: {
            device_code: deviceCode,
            code_verifier: pair.verifier,
            device_uuid: 'dev-pair-1',
            device_name: 'Max',
            platform: 'win32'
        }
    });
    h.check('das Abfragen liefert ein Zugriffstoken', res.status === 200 && res.body.accessToken, null);
    h.check('und ein Aktualisierungstoken', Boolean(res.body.refreshToken), null);
    h.check('samt Benutzer', res.body.user.username === 'beatv', res.body.user);

    const token = res.body.accessToken;

    res = await h.request({ method: 'GET', url: '/api/cloud/me', token });
    h.check('das Token funktioniert', res.status === 200, res.status);

    res = await h.request({
        method: 'POST', url: '/api/auth/device/pair/poll',
        body: { device_code: deviceCode, code_verifier: pair.verifier, device_uuid: 'dev-pair-1' }
    });
    h.check('ein zweites Einloesen wird abgewiesen', res.status === 400, res.body);

    h.section('5) Falscher Verifier');

    const second = pkce();
    res = await h.request({
        method: 'POST', url: '/api/auth/device/pair/start',
        body: { code_challenge: second.challenge, device_name: 'Laptop', platform: 'linux' }
    });
    const wrongPair = res.body;

    h.setSessionUser(session);
    await h.request({ method: 'POST', url: '/api/auth/device/pair/approve', body: { code: wrongPair.userCode } });
    h.setSessionUser(null);

    res = await h.request({
        method: 'POST', url: '/api/auth/device/pair/poll',
        body: {
            device_code: wrongPair.deviceCode,
            code_verifier: pkce().verifier,
            device_uuid: 'dev-pair-2'
        }
    });
    h.check('ein falscher Verifier wird abgewiesen', res.status === 400, res.body);

    res = await h.request({
        method: 'POST', url: '/api/auth/device/pair/poll',
        body: {
            device_code: wrongPair.deviceCode,
            code_verifier: second.verifier,
            device_uuid: 'dev-pair-2'
        }
    });
    h.check('und der Code ist danach verbrannt', res.status === 400, res.body);

    h.section('6) Ablehnen');

    const third = pkce();
    res = await h.request({
        method: 'POST', url: '/api/auth/device/pair/start',
        body: { code_challenge: third.challenge, platform: 'win32' }
    });
    const denied = res.body;

    h.setSessionUser(session);
    await h.request({ method: 'POST', url: '/api/auth/device/pair/deny', body: { code: denied.userCode } });
    h.setSessionUser(null);

    res = await h.request({
        method: 'POST', url: '/api/auth/device/pair/poll',
        body: { device_code: denied.deviceCode, code_verifier: third.verifier, device_uuid: 'dev-pair-3' }
    });
    h.check('ein abgelehnter Code liefert access_denied',
        res.status === 400 && res.body.error === 'access_denied', res.body);

    h.section('7) Cloud-Sperre');

    h.setSessionUser({ id: admin, username: 'root', role: 'admin', banned: false });

    res = await h.request({
        method: 'POST', url: `/api/admin/cloud/users/${userId}/ban`,
        body: { banned: true, reason: 'Missbrauch' }
    });
    h.check('der Admin kann sperren', res.status === 200 && res.body.banned === true, res.body);

    res = await h.request({
        method: 'POST', url: `/api/admin/cloud/users/${admin}/ban`,
        body: { banned: true }
    });
    h.check('sich selbst aber nicht', res.status === 400, res.body);

    h.setSessionUser(null);

    res = await h.request({ method: 'GET', url: '/api/cloud/me', token });
    h.check('das bestehende Token wirkt sofort nicht mehr',
        res.status === 401 || res.status === 403, res.status);

    const [devices] = await h.pool.query(
        'SELECT COUNT(*) AS count FROM client_devices WHERE user_id = ? AND revoked_at IS NULL',
        [userId]
    );
    h.check('alle Geraete sind abgemeldet', Number(devices[0].count) === 0, devices[0]);

    const [notes] = await h.pool.query(
        'SELECT message FROM notifications WHERE user_id = ? ORDER BY id DESC', [userId]
    );
    h.check('der Nutzer wird benachrichtigt',
        notes.length > 0 && notes[0].message.includes('Lux Cloud has been disabled'), notes[0]);
    h.check('mit Grund', notes[0].message.includes('Missbrauch'), notes[0].message);
    h.check('und dem Hinweis auf lokale Dateien',
        notes[0].message.includes('local instances are not affected'), notes[0].message);

    const banned = { ...session, cloud_banned: true, cloud_ban_reason: 'Missbrauch' };
    h.setSessionUser(banned);
    const blocked = pkce();
    res = await h.request({
        method: 'POST', url: '/api/auth/device/pair/start',
        body: { code_challenge: blocked.challenge, platform: 'win32' }
    });
    const blockedPair = res.body;
    res = await h.request({
        method: 'POST', url: '/api/auth/device/pair/approve', body: { code: blockedPair.userCode }
    });
    h.check('ein gesperrtes Konto kann nichts mehr freigeben',
        res.status === 403 && res.body.error === 'cloud_banned', res.body);
    h.setSessionUser(null);

    h.section('8) Entsperren');

    h.setSessionUser({ id: admin, username: 'root', role: 'admin', banned: false });
    res = await h.request({
        method: 'POST', url: `/api/admin/cloud/users/${userId}/ban`, body: { banned: false }
    });
    h.check('der Admin kann entsperren', res.status === 200 && res.body.banned === false, res.body);

    res = await h.request({ method: 'GET', url: '/api/admin/cloud/users' });
    const listed = res.body.users.find((u) => u.id === userId);
    h.check('die Liste zeigt den Sperrstatus', listed && listed.cloudBanned === false, listed);

    const [audit] = await h.pool.query(
        'SELECT action FROM admin_audit_log ORDER BY id DESC LIMIT 2'
    );
    h.check('beide Aktionen stehen im Audit-Log',
        audit.some((a) => a.action === 'cloud_ban') && audit.some((a) => a.action === 'cloud_unban'), audit);
    h.setSessionUser(null);

    h.section('9) Benachrichtigungen fuer den Client');

    const fresh = pkce();
    res = await h.request({
        method: 'POST', url: '/api/auth/device/pair/start', body: { code_challenge: fresh.challenge, platform: 'win32' }
    });
    const freshPair = res.body;
    h.setSessionUser({ ...session, cloud_banned: false });
    await h.request({ method: 'POST', url: '/api/auth/device/pair/approve', body: { code: freshPair.userCode } });
    h.setSessionUser(null);

    res = await h.request({
        method: 'POST', url: '/api/auth/device/pair/poll',
        body: { device_code: freshPair.deviceCode, code_verifier: fresh.verifier, device_uuid: 'dev-pair-9' }
    });
    const freshToken = res.body.accessToken;

    res = await h.request({ method: 'GET', url: '/api/cloud/notifications', token: freshToken });
    h.check('der Client kann Benachrichtigungen lesen', res.status === 200, res.status);
    h.check('mit Zaehler fuer Ungelesene', res.body.unreadCount > 0, res.body.unreadCount);

    res = await h.request({ method: 'POST', url: '/api/cloud/notifications/read', token: freshToken, body: {} });
    h.check('alle als gelesen markieren geht', res.status === 200, res.body);

    res = await h.request({ method: 'GET', url: '/api/cloud/notifications', token: freshToken });
    h.check('danach ist der Zaehler 0', res.body.unreadCount === 0, res.body.unreadCount);

    const foreignToken = freshToken;
    const [otherNote] = await h.pool.query(
        'INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?) RETURNING id',
        [other, 'Fremde Nachricht', 'info']
    );
    res = await h.request({ method: 'GET', url: '/api/cloud/notifications', token: foreignToken });
    h.check('fremde Nachrichten sind nicht sichtbar',
        !res.body.notifications.some((n) => n.message === 'Fremde Nachricht'), res.body.notifications.length);

    h.finish();
}

main().catch((err) => {
    console.error(err);
    h.stop();
    process.exit(1);
});
