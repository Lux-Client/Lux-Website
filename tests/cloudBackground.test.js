const { Harness } = require('./luxcloudHarness');

const h = new Harness();

function multipart(field, filename, contentType, content) {
    const boundary = `----luxbg${Date.now()}`;
    const head = Buffer.from(
        `--${boundary}\r\n`
        + `Content-Disposition: form-data; name="${field}"; filename="${filename}"\r\n`
        + `Content-Type: ${contentType}\r\n\r\n`
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    return {
        body: Buffer.concat([head, content, tail]),
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` }
    };
}

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypisom'), Buffer.alloc(64, 2)]);

async function main() {
    await h.start();

    const userA = await h.createUser({ googleId: 'g-a', username: 'beatv' });
    const userB = await h.createUser({ googleId: 'g-b', username: 'otheruser' });
    const sessionA = { id: userA, username: 'beatv', role: 'user', banned: false };
    const sessionB = { id: userB, username: 'otheruser', role: 'user', banned: false };

    const A1 = (await h.authorizeDevice({ user: sessionA, deviceUuid: 'dev-aaaa-0001', deviceName: 'DESKTOP-A' })).accessToken;
    const A2 = (await h.authorizeDevice({ user: sessionA, deviceUuid: 'dev-aaaa-0002', deviceName: 'LAPTOP-A', platform: 'linux' })).accessToken;
    const B = (await h.authorizeDevice({ user: sessionB, deviceUuid: 'dev-bbbb-0001', deviceName: 'DESKTOP-B' })).accessToken;

    let res;

    h.section('1) Ohne Hintergrund');

    res = await h.request({ url: '/api/cloud/me/background', token: A1 });
    h.check('neues Konto hat keinen Hintergrund', res.status === 200 && res.body.background === null, res.body);

    res = await h.request({ url: '/api/cloud/me/background/file', token: A1, raw: true });
    h.check('Datei ohne Hintergrund -> 404', res.status === 404, res.status);

    res = await h.request({ url: '/api/cloud/me/background' });
    h.check('ohne Token -> 401', res.status === 401, res.body);

    h.section('2) Hochladen und auf dem zweiten Geraet lesen');

    let upload = multipart('background', 'bg.png', 'image/png', PNG);
    res = await h.request({ method: 'PUT', url: '/api/cloud/me/background', token: A1, body: upload.body, headers: upload.headers });
    h.check('PNG hochladen -> 200', res.status === 200 && res.body.background && res.body.background.type === 'image', res.body);
    const firstHash = res.body.background && res.body.background.hash;

    res = await h.request({ url: '/api/cloud/me', token: A2 });
    h.check('/me zeigt den Hintergrund auch auf dem zweiten Geraet',
        res.status === 200 && res.body.background && res.body.background.hash === firstHash, res.body.background);

    res = await h.request({ url: '/api/cloud/me/background/file', token: A2, raw: true });
    h.check('Datei kommt unveraendert zurueck', res.status === 200 && Buffer.compare(res.body, PNG) === 0, res.status);
    h.check('Content-Type image/png', res.headers['content-type'] === 'image/png', res.headers['content-type']);

    res = await h.request({
        url: '/api/cloud/me/background/file', token: A2, raw: true,
        headers: { 'If-None-Match': `"${firstHash}"` }
    });
    h.check('passender ETag -> 304', res.status === 304, res.status);

    res = await h.request({ url: '/api/cloud/me/background', token: B });
    h.check('anderes Konto sieht den Hintergrund nicht', res.body.background === null, res.body);

    h.section('3) Ersetzen und Validierung');

    upload = multipart('background', 'bg.mp4', 'video/mp4', MP4);
    res = await h.request({ method: 'PUT', url: '/api/cloud/me/background', token: A2, body: upload.body, headers: upload.headers });
    h.check('Video ersetzt das Bild', res.status === 200 && res.body.background.type === 'video'
        && res.body.background.hash !== firstHash, res.body);

    const stored = await h.pool.query('SELECT background_key FROM user_cloud_settings WHERE user_id = ?', [userA]);
    h.check('Schluessel zeigt auf das Video', /\.mp4$/.test(stored[0][0].background_key), stored[0][0]);

    upload = multipart('background', 'evil.png', 'image/png', Buffer.from('<script>alert(1)</script>'));
    res = await h.request({ method: 'PUT', url: '/api/cloud/me/background', token: A1, body: upload.body, headers: upload.headers });
    h.check('falscher Inhalt trotz image/png -> 400', res.status === 400 && res.body.error === 'unsupported_type', res.body);

    upload = multipart('other', 'bg.png', 'image/png', PNG);
    res = await h.request({ method: 'PUT', url: '/api/cloud/me/background', token: A1, body: upload.body, headers: upload.headers });
    h.check('falsches Feld -> 400', res.status === 400, res.body);

    h.section('4) Entfernen');

    res = await h.request({ method: 'DELETE', url: '/api/cloud/me/background', token: A1 });
    h.check('loeschen -> 200', res.status === 200 && res.body.background === null, res.body);

    res = await h.request({ url: '/api/cloud/me/background', token: A2 });
    h.check('zweites Geraet sieht keinen Hintergrund mehr', res.body.background === null, res.body);

    h.section('5) Cloud-Daten loeschen raeumt den Hintergrund mit ab');

    upload = multipart('background', 'bg.png', 'image/png', PNG);
    await h.request({ method: 'PUT', url: '/api/cloud/me/background', token: A1, body: upload.body, headers: upload.headers });
    res = await h.request({ method: 'DELETE', url: '/api/cloud/me', token: A1, body: { confirm: 'delete-my-cloud-data' } });
    h.check('purge meldet den Hintergrund', res.status === 200 && res.body.backgroundRemoved === true, res.body);

    res = await h.request({ url: '/api/cloud/me/background', token: A1 });
    h.check('nach purge kein Hintergrund', res.body.background === null, res.body);

    h.finish();
}

main().catch((err) => {
    console.error(err);
    h.stop();
    process.exit(1);
});
