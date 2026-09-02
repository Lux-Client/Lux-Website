const { Harness } = require('./luxcloudHarness');

const h = new Harness();

async function main() {
    await h.start();

    const userA = await h.createUser({ googleId: 'g-p7a', username: 'beatv' });
    const userB = await h.createUser({ googleId: 'g-p7b', username: 'fremd' });

    const sessionA = { id: userA, username: 'beatv', role: 'user', banned: false };
    const sessionB = { id: userB, username: 'fremd', role: 'user', banned: false };

    const PC1 = (await h.authorizeDevice({ user: sessionA, deviceUuid: 'dev-p7-pc1' })).accessToken;
    const PC2 = (await h.authorizeDevice({ user: sessionA, deviceUuid: 'dev-p7-pc2', deviceName: 'LAPTOP' })).accessToken;
    const FREMD = (await h.authorizeDevice({ user: sessionB, deviceUuid: 'dev-p7-x', platform: 'linux' })).accessToken;

    const UUID = 'inst-p7-skyblock';
    let res;

    await h.request({
        method: 'POST', url: '/api/cloud/instances', token: PC1,
        body: { instanceUuid: UUID, name: 'Skyblock' }
    });

    h.section('1) Session starten');

    res = await h.request({ method: 'POST', url: `/api/cloud/instances/${UUID}/session`, token: PC1 });
    h.check('PC1 bekommt eine Session', res.status === 201 && typeof res.body.sessionId === 'string', res.body);
    h.check('kein anderes Geraet ist aktiv', res.body.otherActiveSessions.length === 0, res.body);
    h.check('der Heartbeat-Takt wird genannt', res.body.heartbeatIntervalMs > 0, res.body);

    const session1 = res.body.sessionId;

    res = await h.request({ method: 'GET', url: `/api/cloud/instances/${UUID}/head`, token: PC1 });
    h.check('head meldet die laufende Session', res.body.activeSession !== null, res.body);
    h.check('head nennt das Geraet', res.body.activeSession.deviceUuid === 'dev-p7-pc1', res.body.activeSession);

    h.section('2) Zweites Geraet sieht die Warnung');

    res = await h.request({ method: 'POST', url: `/api/cloud/instances/${UUID}/session`, token: PC2 });
    h.check('PC2 darf trotzdem starten', res.status === 201, res.body);
    h.check('PC2 erfaehrt von PC1', res.body.otherActiveSessions.length === 1, res.body.otherActiveSessions);
    h.check('mit lesbarem Geraetenamen',
        res.body.otherActiveSessions[0].deviceName === 'DESKTOP-TEST', res.body.otherActiveSessions[0]);

    const session2 = res.body.sessionId;

    h.section('3) Heartbeat');

    res = await h.request({ method: 'POST', url: `/api/cloud/sessions/${session1}/heartbeat`, token: PC1 });
    h.check('der Heartbeat wird angenommen', res.status === 200 && res.body.ok === true, res.body);

    res = await h.request({ method: 'POST', url: `/api/cloud/sessions/${session1}/heartbeat`, token: PC2 });
    h.check('ein fremdes Geraet kann den Heartbeat nicht setzen', res.status === 404, res.body);

    res = await h.request({ method: 'POST', url: `/api/cloud/sessions/${session1}/heartbeat`, token: FREMD });
    h.check('ein fremdes Konto erst recht nicht', res.status === 404, res.body);

    res = await h.request({ method: 'POST', url: '/api/cloud/sessions/nichtvorhanden/heartbeat', token: PC1 });
    h.check('eine unbekannte Session gibt 404', res.status === 404, res.body);

    h.section('4) Abgestorbene Sessions blockieren nicht');

    await h.pool.query(
        `UPDATE cloud_sessions SET last_heartbeat_at = NOW() - INTERVAL '30 minutes'
          WHERE session_uuid IN (?, ?)`,
        [session1, session2]
    );

    res = await h.request({ method: 'GET', url: `/api/cloud/instances/${UUID}/head`, token: PC1 });
    h.check('head blendet tote Sessions aus', res.body.activeSession === null, res.body.activeSession);

    res = await h.request({ method: 'POST', url: `/api/cloud/instances/${UUID}/session`, token: PC1 });
    h.check('ein neuer Start sieht keine Altlasten', res.body.otherActiveSessions.length === 0, res.body);

    const session3 = res.body.sessionId;

    h.section('5) Session beenden');

    res = await h.request({ method: 'POST', url: `/api/cloud/sessions/${session3}/end`, token: PC1 });
    h.check('das Beenden wird angenommen', res.status === 200 && res.body.ok === true, res.body);
    h.check('es war noch nicht beendet', res.body.alreadyEnded === false, res.body);

    res = await h.request({ method: 'POST', url: `/api/cloud/sessions/${session3}/end`, token: PC1 });
    h.check('ein zweites Beenden ist folgenlos', res.status === 200 && res.body.alreadyEnded === true, res.body);

    res = await h.request({ method: 'POST', url: `/api/cloud/sessions/${session3}/heartbeat`, token: PC1 });
    h.check('nach dem Ende schlaegt der Heartbeat fehl',
        res.status === 409 && res.body.error === 'session_ended', res.body);

    res = await h.request({ method: 'GET', url: `/api/cloud/instances/${UUID}/head`, token: PC1 });
    h.check('head meldet danach keine Session mehr', res.body.activeSession === null, res.body.activeSession);

    h.section('6) Session setzt den 15-Tage-Timer zurueck');

    await h.pool.query(
        `UPDATE cloud_instances SET last_touched_at = NOW() - INTERVAL '10 days' WHERE instance_uuid = ?`,
        [UUID]
    );
    const before = (await h.request({ method: 'GET', url: `/api/cloud/instances/${UUID}/head`, token: PC1 }))
        .body.expiresAt;

    await h.request({ method: 'POST', url: `/api/cloud/instances/${UUID}/session`, token: PC1 });
    const after = (await h.request({ method: 'GET', url: `/api/cloud/instances/${UUID}/head`, token: PC1 }))
        .body.expiresAt;

    h.check('der Ablauf wandert nach hinten', after > before, { before, after });

    h.section('7) Fremde Instanz');

    res = await h.request({ method: 'POST', url: `/api/cloud/instances/${UUID}/session`, token: FREMD });
    h.check('ein fremdes Konto bekommt keine Session', res.status === 404, res.body);

    h.finish();
}

main().catch((err) => {
    console.error(err);
    h.stop();
    process.exit(1);
});
