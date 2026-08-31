const crypto = require('crypto');
const { Harness, base64Url, pkce, sleep } = require('./luxcloudHarness');

const h = new Harness({ accessTtlSeconds: 2 });

async function main() {
    await h.start();

    const userA = await h.createUser({
        googleId: 'g-1', username: 'beatv', email: 'beatv@example.com', avatar: 'https://example.com/a.png'
    });
    const userB = await h.createUser({
        googleId: 'g-2', username: 'bannedguy', email: 'b@example.com', banned: true
    });

    const state = base64Url(crypto.randomBytes(16));
    const approve = (opts) => h.approve(opts);
    let res;

    h.section('1) Zustimmungsseite und Codeausgabe');
    h.setSessionUser(null);
    res = await h.request({ url: `/auth/device?code_challenge=${pkce().challenge}&state=${state}` });
    h.check('anonym -> Redirect auf Google-Login',
        res.status === 302 && res.headers.location.startsWith('/auth/google?returnTo='), res.headers.location);

    res = await h.request({ url: `/auth/device?code_challenge=short&state=${state}` });
    h.check('kaputte Parameter -> 400', res.status === 400, res.body);

    h.setSessionUser({ id: userA, username: 'beatv', role: 'user', banned: false });
    const p1 = pkce();
    res = await h.request({
        url: `/auth/device?code_challenge=${p1.challenge}&state=${state}&device_name=DESKTOP-TEST&platform=win32`
    });
    h.check('angemeldet -> Redirect auf die SPA-Seite',
        res.status === 302 && res.headers.location.startsWith('/authorize-device?'), res.headers.location);

    res = await approve({ challenge: p1.challenge, state });
    h.check('approve liefert eine luxclient://auth URL',
        res.status === 200 && String(res.body.redirectUrl).startsWith('luxclient://auth?code='), res.body);

    res = await h.request({
        method: 'POST',
        url: '/auth/device/approve',
        body: { code_challenge: p1.challenge, state },
        headers: { Origin: 'https://evil.example.com' }
    });
    h.check('approve von fremder Origin -> 403', res.status === 403, res.body);

    h.section('2) Token-Tausch');
    const p2 = pkce();
    res = await approve({ challenge: p2.challenge, state });
    const code2 = h.codeFrom(res.body.redirectUrl);

    res = await h.request({
        method: 'POST',
        url: '/api/auth/device/token',
        body: {
            code: code2, code_verifier: base64Url(crypto.randomBytes(32)),
            device_uuid: 'dev-aaaaaaaa-1', platform: 'win32'
        }
    });
    h.check('falscher code_verifier -> invalid_grant',
        res.status === 400 && res.body.error === 'invalid_grant', res.body);

    const p3 = pkce();
    res = await approve({ challenge: p3.challenge, state });
    const code3 = h.codeFrom(res.body.redirectUrl);

    res = await h.request({
        method: 'POST',
        url: '/api/auth/device/token',
        body: {
            code: code3, code_verifier: p3.verifier, device_uuid: 'dev-aaaaaaaa-1',
            device_name: 'DESKTOP-TEST', platform: 'win32', app_version: '1.11.0'
        }
    });
    h.check('gueltiger Tausch -> Tokenpaar',
        res.status === 200 && res.body.accessToken && res.body.refreshToken, res.body);
    h.check('Antwort enthaelt den User', res.body.user && res.body.user.username === 'beatv', res.body.user);
    const access = res.body.accessToken;
    const refresh = res.body.refreshToken;

    res = await h.request({
        method: 'POST',
        url: '/api/auth/device/token',
        body: { code: code3, code_verifier: p3.verifier, device_uuid: 'dev-aaaaaaaa-2', platform: 'win32' }
    });
    h.check('derselbe Code ein zweites Mal -> invalid_grant',
        res.status === 400 && res.body.error === 'invalid_grant', res.body);

    h.section('3) Konto und Geraete');
    res = await h.request({ url: '/api/cloud/me', token: access });
    h.check('GET /me -> 200', res.status === 200, res.body);
    h.check('/me liefert Standardkontingent 5 GiB / 10 Instanzen',
        res.body.quota && res.body.quota.quotaBytes === 5368709120 && res.body.quota.maxInstances === 10,
        res.body.quota);
    h.check('/me liefert die Standardeinstellungen',
        res.body.settings && res.body.settings.cloudSyncEnabled === true
        && res.body.settings.syncWorldsDefault === false, res.body.settings);

    res = await h.request({ url: '/api/cloud/me' });
    h.check('GET /me ohne Token -> 401 unauthorized',
        res.status === 401 && res.body.error === 'unauthorized', res.body);

    res = await h.request({
        method: 'PATCH', url: '/api/cloud/me/settings', token: access, body: { syncWorldsDefault: true }
    });
    h.check('PATCH settings speichert', res.status === 200 && res.body.settings.syncWorldsDefault === true, res.body);

    res = await h.request({
        method: 'PATCH', url: '/api/cloud/me/settings', token: access, body: { syncWorldsDefault: 'yes' }
    });
    h.check('PATCH settings mit falschem Typ -> 400', res.status === 400, res.body);

    res = await h.request({ url: '/api/cloud/devices', token: access });
    h.check('GET /devices listet genau dieses Geraet',
        res.status === 200 && res.body.devices.length === 1 && res.body.devices[0].isCurrent === true, res.body);

    h.section('4) Isolation zwischen Konten');
    h.setSessionUser({ id: userB, username: 'bannedguy', role: 'user', banned: true });
    const p4 = pkce();
    res = await approve({ challenge: p4.challenge, state });
    h.check('gebannter User bekommt keinen Code -> 403', res.status === 403, res.body);

    await h.pool.query('UPDATE users SET banned = ? WHERE id = ?', [false, userB]);
    h.setSessionUser({ id: userB, username: 'bannedguy', role: 'user', banned: false });
    const p5 = pkce();
    res = await approve({ challenge: p5.challenge, state, deviceName: 'LAPTOP-B' });
    const code5 = h.codeFrom(res.body.redirectUrl);

    res = await h.request({
        method: 'POST',
        url: '/api/auth/device/token',
        body: { code: code5, code_verifier: p5.verifier, device_uuid: 'dev-aaaaaaaa-1', platform: 'linux' }
    });
    h.check('fremde Geraete-ID -> device_conflict',
        res.status === 409 && res.body.error === 'device_conflict', res.body);

    res = await h.request({
        method: 'POST',
        url: '/api/auth/device/token',
        body: { code: code5, code_verifier: p5.verifier, device_uuid: 'dev-bbbbbbbb-1', platform: 'linux' }
    });
    h.check('nach device_conflict ist derselbe Code noch gueltig',
        res.status === 200 && Boolean(res.body.accessToken), res.body);
    const accessB = res.body.accessToken;

    res = await h.request({ url: '/api/cloud/devices', token: accessB });
    h.check('User B sieht nur sein eigenes Geraet',
        res.status === 200 && res.body.devices.length === 1 && res.body.devices[0].name === 'LAPTOP-B', res.body);

    res = await h.request({ method: 'DELETE', url: '/api/cloud/devices/dev-aaaaaaaa-1', token: accessB });
    h.check('User B kann das Geraet von User A nicht abmelden -> 404',
        res.status === 404 && res.body.error === 'not_found', res.body);

    res = await h.request({ url: '/api/cloud/me', token: accessB });
    h.check('User B sieht sein eigenes Konto',
        res.status === 200 && res.body.user.username === 'bannedguy', res.body.user);
    h.check('Einstellung von User A ist bei B nicht sichtbar',
        res.body.settings.syncWorldsDefault === false, res.body.settings);

    h.section('5) Refresh, Rotation und Reuse-Erkennung');
    res = await h.request({
        method: 'POST', url: '/api/auth/device/refresh',
        body: { refresh_token: refresh, device_uuid: 'dev-aaaaaaaa-1' }
    });
    h.check('Refresh liefert ein neues Paar', res.status === 200 && res.body.refreshToken !== refresh, res.body);
    const refresh2 = res.body.refreshToken;
    const access2 = res.body.accessToken;

    res = await h.request({
        method: 'POST', url: '/api/auth/device/refresh',
        body: { refresh_token: refresh, device_uuid: 'dev-aaaaaaaa-1' }
    });
    h.check('alter Token im Gnadenfenster wird noch akzeptiert', res.status === 200, res.body);
    const refresh3 = res.body.refreshToken;

    await h.pool.query(
        `UPDATE client_devices SET prev_refresh_valid_until = NOW() - INTERVAL '1 minute' WHERE device_uuid = ?`,
        ['dev-aaaaaaaa-1']
    );
    res = await h.request({
        method: 'POST', url: '/api/auth/device/refresh',
        body: { refresh_token: refresh2, device_uuid: 'dev-aaaaaaaa-1' }
    });
    h.check('verbrauchter Token nach dem Gnadenfenster -> device_revoked',
        res.status === 401 && res.body.error === 'device_revoked', res.body);

    const [notes] = await h.pool.query('SELECT message, type FROM notifications WHERE user_id = ?', [userA]);
    h.check('Reuse erzeugt eine Notification', notes.length === 1 && notes[0].type === 'warning', notes);

    res = await h.request({ url: '/api/cloud/me', token: access2 });
    h.check('nach der Reuse-Erkennung sind alte Access-Tokens tot',
        res.status === 401 && res.body.error === 'device_revoked', res.body);

    res = await h.request({
        method: 'POST', url: '/api/auth/device/refresh',
        body: { refresh_token: refresh3, device_uuid: 'dev-aaaaaaaa-1' }
    });
    h.check('auch der zuletzt gueltige Token faellt mit der Kette', res.status === 401, res.body);

    h.section('6) Ablauf und Abmelden');
    const sessionA = { id: userA, username: 'beatv', role: 'user', banned: false };
    let tokens = await h.authorizeDevice({ user: sessionA, deviceUuid: 'dev-aaaaaaaa-1' });
    h.check('Neuanmeldung eines abgemeldeten Geraets funktioniert', Boolean(tokens.accessToken), tokens);
    const accessC = tokens.accessToken;

    res = await h.request({ url: '/api/cloud/me', token: accessC });
    h.check('neues Token wird akzeptiert', res.status === 200, res.body);

    console.log('     ... warte auf den Ablauf des Access-Tokens (2 s)');
    await sleep(2500);
    res = await h.request({ url: '/api/cloud/me', token: accessC });
    h.check('abgelaufenes Token -> token_expired',
        res.status === 401 && res.body.error === 'token_expired', res.body);

    const [devRow] = await h.pool.query(
        'SELECT refresh_token_hash FROM client_devices WHERE device_uuid = ?', ['dev-aaaaaaaa-1']
    );
    h.check('Refresh-Token liegt nur als Hash in der DB',
        devRow[0] && /^[0-9a-f]{64}$/.test(devRow[0].refresh_token_hash), devRow[0]);

    tokens = await h.authorizeDevice({ user: sessionA, deviceUuid: 'dev-aaaaaaaa-1' });
    const accessD = tokens.accessToken;

    res = await h.request({ method: 'POST', url: '/api/auth/device/revoke', token: accessD });
    h.check('revoke -> 200', res.status === 200, res.body);

    res = await h.request({ url: '/api/cloud/me', token: accessD });
    h.check('nach revoke ist das Token wertlos',
        res.status === 401 && res.body.error === 'device_revoked', res.body);

    h.section('7) Gebannte Konten');
    const sessionB = { id: userB, username: 'bannedguy', role: 'user', banned: false };
    tokens = await h.authorizeDevice({
        user: sessionB, deviceUuid: 'dev-bbbbbbbb-1', deviceName: 'LAPTOP-B', platform: 'linux'
    });
    const accessB2 = tokens.accessToken;

    await h.pool.query('UPDATE users SET banned = ? WHERE id = ?', [true, userB]);
    res = await h.request({ url: '/api/cloud/me', token: accessB2 });
    h.check('gebannter User -> 403 forbidden', res.status === 403 && res.body.error === 'forbidden', res.body);

    res = await h.request({
        method: 'POST', url: '/api/auth/device/refresh',
        body: { refresh_token: 'irrelevant', device_uuid: 'dev-bbbbbbbb-1' }
    });
    h.check('Refresh eines gebannten Kontos -> 403', res.status === 403 && res.body.error === 'forbidden', res.body);

    h.finish();
}

main().catch((err) => {
    console.error('\nTEST HARNESS ERROR:', err);
    process.exit(2);
});
