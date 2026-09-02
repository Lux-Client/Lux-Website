const { Harness } = require('./luxcloudHarness');

const h = new Harness();

const HOUR = 60 * 60 * 1000;

async function main() {
    await h.start();

    const userA = await h.createUser({ googleId: 'g-p8a', username: 'beatv' });
    const userB = await h.createUser({ googleId: 'g-p8b', username: 'fremd' });

    const sessionA = { id: userA, username: 'beatv', role: 'user', banned: false };
    const sessionB = { id: userB, username: 'fremd', role: 'user', banned: false };

    const PC1 = (await h.authorizeDevice({ user: sessionA, deviceUuid: 'dev-p8-pc1' })).accessToken;
    const PC2 = (await h.authorizeDevice({ user: sessionA, deviceUuid: 'dev-p8-pc2', deviceName: 'LAPTOP' })).accessToken;
    const FREMD = (await h.authorizeDevice({ user: sessionB, deviceUuid: 'dev-p8-x', platform: 'linux' })).accessToken;

    const UUID = 'inst-p8-skyblock';
    let res;

    await h.request({
        method: 'POST', url: '/api/cloud/instances', token: PC1,
        body: { instanceUuid: UUID, name: 'Skyblock' }
    });

    const put = (token, body) => h.request({
        method: 'PUT', url: `/api/cloud/instances/${UUID}/playtime`, token, body
    });

    h.section('1) Die Summe ueber zwei Geraete');

    res = await put(PC1, { deviceTotalMs: 20 * HOUR });
    h.check('PC1 meldet 20 h', res.status === 200 && res.body.deviceTotalMs === 20 * HOUR, res.body);
    h.check('die Instanz steht bei 20 h', res.body.instanceTotalMs === 20 * HOUR, res.body);

    res = await put(PC2, { deviceTotalMs: 15 * HOUR });
    h.check('PC2 meldet 15 h', res.status === 200, res.body);
    h.check('20 h + 15 h ergibt 35 h', res.body.instanceTotalMs === 35 * HOUR, res.body);
    h.check('die Aufschluesselung nennt beide Geraete', res.body.byDevice.length === 2, res.body.byDevice);

    res = await h.request({ method: 'GET', url: `/api/cloud/instances/${UUID}/head`, token: PC1 });
    h.check('head liefert die Gesamtzeit', res.body.playtimeTotalMs === 35 * HOUR, res.body);

    h.section('2) Doppeltes Senden ist folgenlos');

    for (let i = 0; i < 5; i += 1) {
        res = await put(PC1, { deviceTotalMs: 20 * HOUR });
    }
    h.check('fuenfmal derselbe Wert aendert nichts', res.body.instanceTotalMs === 35 * HOUR, res.body);

    h.section('3) Monotonie');

    res = await put(PC1, { deviceTotalMs: 10 * HOUR });
    h.check('ein kleinerer Wert wird abgewiesen',
        res.status === 409 && res.body.error === 'non_monotonic', res.body);
    h.check('der gespeicherte Wert wird mitgeteilt',
        res.body.details.storedTotalMs === 20 * HOUR, res.body.details);

    res = await h.request({ method: 'GET', url: `/api/cloud/instances/${UUID}/playtime`, token: PC1 });
    h.check('die Zahl blieb unveraendert', res.body.totalMs === 35 * HOUR, res.body);

    h.section('4) Plausibilitaet');

    res = await put(PC1, { deviceTotalMs: 20 * HOUR + 5 * HOUR });
    h.check('ein Sprung ueber die verstrichene Zeit wird abgewiesen',
        res.status === 422 && res.body.error === 'implausible_playtime', res.body);
    h.check('der Fehler nennt die verstrichene Zeit',
        Number.isFinite(res.body.details.elapsedMs), res.body.details);

    res = await put(PC1, { deviceTotalMs: 20 * HOUR + 30 * 60 * 1000 });
    h.check('ein Zuwachs innerhalb der Kulanz geht durch', res.status === 200, res.body);

    res = await put(PC1, { deviceTotalMs: Number.MAX_SAFE_INTEGER });
    h.check('ein absurder Wert wird abgewiesen',
        res.status === 422 && res.body.error === 'implausible_playtime', res.body);

    res = await put(PC1, { deviceTotalMs: -5 });
    h.check('ein negativer Wert wird abgewiesen', res.status === 400, res.body);

    res = await put(PC1, { deviceTotalMs: 'viel' });
    h.check('ein nicht numerischer Wert wird abgewiesen', res.status === 400, res.body);

    h.section('5) Erstmeldung darf gross sein');

    const UUID2 = 'inst-p8-alt';
    await h.request({
        method: 'POST', url: '/api/cloud/instances', token: PC1,
        body: { instanceUuid: UUID2, name: 'Alte Instanz' }
    });

    res = await h.request({
        method: 'PUT', url: `/api/cloud/instances/${UUID2}/playtime`, token: PC1,
        body: { deviceTotalMs: 500 * HOUR }
    });
    h.check('500 h aus einer bestehenden Instanz werden uebernommen',
        res.status === 200 && res.body.deviceTotalMs === 500 * HOUR, res.body);

    res = await h.request({
        method: 'PUT', url: `/api/cloud/instances/${UUID2}/playtime`, token: PC1,
        body: { deviceTotalMs: 900 * HOUR }
    });
    h.check('danach greift die Plausibilitaet wieder',
        res.status === 422 && res.body.error === 'implausible_playtime', res.body);

    h.section('6) Isolation');

    res = await h.request({
        method: 'PUT', url: `/api/cloud/instances/${UUID}/playtime`, token: FREMD,
        body: { deviceTotalMs: HOUR }
    });
    h.check('ein fremdes Konto kann nichts schreiben', res.status === 404, res.body);

    res = await h.request({ method: 'GET', url: `/api/cloud/instances/${UUID}/playtime`, token: FREMD });
    h.check('und nichts lesen', res.status === 404, res.body);

    res = await h.request({ method: 'GET', url: `/api/cloud/instances/${UUID}/playtime`, token: PC2 });
    h.check('das eigene Geraet sieht seinen Anteil', res.body.deviceTotalMs === 15 * HOUR, res.body);
    h.check('und die Gesamtsumme', res.body.totalMs > 35 * HOUR, res.body);

    h.section('7) Playtime setzt den 15-Tage-Timer zurueck');

    await h.pool.query(
        `UPDATE cloud_instances SET last_touched_at = NOW() - INTERVAL '10 days' WHERE instance_uuid = ?`,
        [UUID]
    );
    const before = (await h.request({ method: 'GET', url: `/api/cloud/instances/${UUID}/head`, token: PC2 }))
        .body.expiresAt;

    await put(PC2, { deviceTotalMs: 15 * HOUR + 60000 });

    const after = (await h.request({ method: 'GET', url: `/api/cloud/instances/${UUID}/head`, token: PC2 }))
        .body.expiresAt;
    h.check('der Ablauf wandert nach hinten', after > before, { before, after });

    h.finish();
}

main().catch((err) => {
    console.error(err);
    h.stop();
    process.exit(1);
});
