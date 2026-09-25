// Zusammenarbeit an einer Cloud-Instanz: Mitglieder, gefilterte Sicht, zusammengefuehrte
// Commits, Urheberschaft -- und vor allem die Grenze zu den privaten Daten des Hosts.

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
        throw new Error(`upload failed for ${hash}: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return hash;
}

function entry(path, buffer) {
    const hash = sha256(buffer);
    return { path, size: buffer.length, mtime: 1756582980000, sha256: hash, blob: hash };
}

function manifestFor(uuid, entries, name = 'Team Pack') {
    return {
        manifestVersion: 1,
        instanceId: uuid,
        name,
        createdAt: 1756582980000,
        runtime: { mcVersion: '1.21.1', loader: 'fabric', loaderVersion: '0.16.0' },
        entries: [...entries].sort((a, b) => (a.path < b.path ? -1 : 1))
    };
}

const paths = (manifest) => manifest.entries.map((e) => e.path).sort();

async function main() {
    await h.start();

    const hostId = await h.createUser({ googleId: 'g-host', username: 'host', email: 'Host@Example.com' });
    const bobId = await h.createUser({ googleId: 'g-bob', username: 'bob', email: 'bob@example.com' });
    const carlId = await h.createUser({ googleId: 'g-carl', username: 'carl', email: 'carl@example.com' });
    await h.createUser({ googleId: 'g-eve', username: 'eve', email: 'eve@example.com' });

    const session = (id, username) => ({ id, username, role: 'user', banned: false });
    const HOST = (await h.authorizeDevice({ user: session(hostId, 'host'), deviceUuid: 'dev-host-0001' })).accessToken;
    const BOB = (await h.authorizeDevice({ user: session(bobId, 'bob'), deviceUuid: 'dev-bob-00001' })).accessToken;
    const CARL = (await h.authorizeDevice({ user: session(carlId, 'carl'), deviceUuid: 'dev-carl-0001' })).accessToken;

    const UUID = 'inst-team-pack-0001';
    let res;

    await h.request({
        method: 'POST', url: '/api/cloud/instances', token: HOST,
        body: { instanceUuid: UUID, name: 'Team Pack', mcVersion: '1.21.1', loader: 'fabric' }
    });

    const modA = Buffer.from('mod-a'.repeat(200));
    const options = Buffer.from('key_key.jump:key.keyboard.space\n');
    const world = Buffer.from('level-data'.repeat(50));
    const instanceJson = Buffer.from(JSON.stringify({ name: 'Team Pack', version: '1.21.1', loader: 'fabric' }));
    for (const buffer of [modA, options, world, instanceJson]) await uploadBlob(HOST, buffer);

    res = await h.request({
        method: 'POST', url: `/api/cloud/instances/${UUID}/commit`, token: HOST,
        body: {
            manifest: manifestFor(UUID, [
                entry('instance.json', instanceJson),
                entry('mods/a.jar', modA),
                entry('options.txt', options),
                entry('saves/Welt/level.dat', world)
            ]),
            parentRevision: 0
        }
    });
    h.check('der Host committet Revision 1', res.status === 201 && res.body.revision === 1, res.body);
    const hostManifestHash = res.body.manifestHash;

    h.section('1) Mitglieder hinzufuegen');

    const addMember = (token, email) => h.request({
        method: 'POST', url: `/api/cloud/instances/${UUID}/members`, token, body: { email }
    });

    res = await addMember(HOST, 'keine-mail');
    h.check('eine ungueltige Adresse wird abgelehnt', res.status === 400 && res.body.error === 'invalid_email', res.body);

    res = await addMember(HOST, 'niemand@example.com');
    h.check('eine Adresse ohne Lux-Konto wird abgelehnt', res.status === 404 && res.body.error === 'user_not_found', res.body);

    res = await addMember(HOST, 'host@example.com');
    h.check('der Host kann sich nicht selbst einladen', res.status === 400, res.body);

    res = await addMember(HOST, '  BOB@example.com ');
    h.check('ein Konto wird ueber seine E-Mail hinzugefuegt (Gross-/Kleinschreibung egal)',
        res.status === 201 && res.body.members.length === 1 && res.body.members[0].username === 'bob', res.body);
    h.check('der Host sieht die E-Mail seiner Mitglieder', res.body.members[0].email === 'bob@example.com', res.body.members[0]);

    res = await addMember(HOST, 'bob@example.com');
    h.check('doppelt hinzufuegen geht nicht', res.status === 409 && res.body.error === 'already_member', res.body);

    res = await addMember(BOB, 'carl@example.com');
    h.check('ein Mitglied kann niemanden einladen', res.status === 403, res.body);

    res = await addMember(CARL, 'carl@example.com');
    h.check('ein Fremder sieht die Instanz gar nicht', res.status === 404, res.body);

    const [notes] = await h.pool.query('SELECT message FROM notifications WHERE user_id = ?', [bobId]);
    h.check('das Mitglied wird benachrichtigt', notes.some((n) => n.message.includes('Team Pack')), notes);

    h.section('2) Was ein Mitglied sieht');

    res = await h.request({ method: 'GET', url: '/api/cloud/shared', token: BOB });
    const shared = res.body.instances || [];
    h.check('die Instanz steht unter "geteilt"', res.status === 200 && shared.length === 1 && shared[0].instanceUuid === UUID, res.body);
    h.check('mit dem Host als Besitzer', shared[0] && shared[0].owner.username === 'host', shared[0]);
    h.check('ohne den Hash des vollen Manifests', shared[0] && shared[0].manifestHash === null, shared[0]);

    res = await h.request({ method: 'GET', url: '/api/cloud/instances', token: BOB });
    h.check('in der eigenen Liste des Mitglieds taucht sie nicht auf', (res.body.instances || []).length === 0, res.body);

    res = await h.request({ method: 'GET', url: `/api/cloud/instances/${UUID}/head`, token: BOB });
    h.check('head funktioniert fuer Mitglieder', res.status === 200 && res.body.revision === 1 && res.body.access === 'member', res.body);
    h.check('head verraet keinen Manifest-Hash', res.body.manifestHash === null, res.body);

    res = await h.request({ method: 'GET', url: `/api/cloud/instances/${UUID}/manifest`, token: BOB });
    h.check('das Mitglied bekommt ein Manifest', res.status === 200, res.body);
    h.check('nur mit gemeinsamen Dateien und instance.json',
        JSON.stringify(paths(res.body.manifest)) === JSON.stringify(['instance.json', 'mods/a.jar']), paths(res.body.manifest));
    h.check('ohne Manifest-Hash', res.body.manifestHash === null, res.body);

    res = await h.request({ method: 'GET', url: `/api/cloud/blobs/${sha256(modA)}`, token: BOB });
    h.check('die gemeinsame Mod laesst sich laden', res.status === 200, res.status);

    res = await h.request({ method: 'GET', url: `/api/cloud/blobs/${sha256(options)}`, token: BOB });
    h.check('die options.txt des Hosts nicht', res.status === 404, res.status);

    res = await h.request({ method: 'GET', url: `/api/cloud/blobs/${sha256(world)}`, token: BOB });
    h.check('seine Welt auch nicht', res.status === 404, res.status);

    // Der Versuch, das volle Manifest per Hash an sich zu ziehen.
    await h.request({
        method: 'POST', url: `/api/cloud/instances/${UUID}/negotiate`, token: BOB,
        body: { blobs: [{ hash: hostManifestHash, size: 10 }] }
    });
    res = await h.request({ method: 'GET', url: `/api/cloud/blobs/${hostManifestHash}`, token: BOB });
    h.check('das volle Manifest laesst sich nicht per Hash erschleichen', res.status === 404, res.status);

    res = await h.request({
        method: 'PUT', url: `/api/cloud/blobs/${hostManifestHash}`, token: BOB,
        body: Buffer.from('x'), headers: { 'X-Lux-Compression': 'none' }
    });
    res = await h.request({ method: 'GET', url: `/api/cloud/blobs/${hostManifestHash}`, token: BOB });
    h.check('auch nicht ueber einen Upload-Versuch', res.status === 404, res.status);

    h.section('3) Ein Mitglied committet');

    const modB = Buffer.from('mod-b'.repeat(300));
    const bobOptions = Buffer.from('key_key.jump:key.keyboard.j\n');
    const bobWorld = Buffer.from('bobs-welt'.repeat(40));
    for (const buffer of [modB, bobOptions, bobWorld]) await uploadBlob(BOB, buffer);

    res = await h.request({
        method: 'POST', url: `/api/cloud/instances/${UUID}/negotiate`, token: BOB,
        body: { blobs: [{ hash: sha256(modB), size: modB.length }] }
    });
    h.check('negotiate funktioniert fuer Mitglieder', res.status === 200, res.body);
    h.check('ohne die Quota des Hosts zu verraten', res.body.quota === null, res.body);

    res = await h.request({
        method: 'POST', url: `/api/cloud/instances/${UUID}/commit`, token: BOB,
        body: {
            manifest: manifestFor(UUID, [
                entry('mods/a.jar', modA),
                entry('mods/b.jar', modB),
                entry('options.txt', bobOptions),
                entry('saves/BobsWelt/level.dat', bobWorld)
            ], 'Bobs Name'),
            parentRevision: 1
        }
    });
    h.check('der Commit des Mitglieds wird angenommen', res.status === 201 && res.body.revision === 2, res.body);
    h.check('ohne Manifest-Hash in der Antwort', res.body.manifestHash === null, res.body);

    res = await h.request({ method: 'GET', url: `/api/cloud/instances/${UUID}/manifest`, token: HOST });
    const merged = res.body.manifest;
    h.check('der Host sieht die neue Mod', paths(merged).includes('mods/b.jar'), paths(merged));
    h.check('seine options.txt ist unveraendert',
        merged.entries.find((e) => e.path === 'options.txt').sha256 === sha256(options), merged.entries);
    h.check('seine Welt ist noch da', paths(merged).includes('saves/Welt/level.dat'), paths(merged));
    h.check('Bobs private Welt ist nicht hineingeraten', !paths(merged).includes('saves/BobsWelt/level.dat'), paths(merged));
    h.check('der Name bleibt der des Hosts', merged.name === 'Team Pack', merged.name);

    res = await h.request({ method: 'GET', url: `/api/cloud/instances/${UUID}/authors`, token: HOST });
    h.check('b.jar wird Bob zugeschrieben', res.body.authors['mods/b.jar'] && res.body.authors['mods/b.jar'].username === 'bob', res.body);
    h.check('der Host wird mitgeliefert', res.body.owner && res.body.owner.username === 'host', res.body.owner);

    res = await h.request({
        method: 'POST', url: `/api/cloud/instances/${UUID}/commit`, token: BOB,
        body: { manifest: manifestFor(UUID, [entry('mods/b.jar', modB)]), parentRevision: 1 }
    });
    h.check('ein veralteter Stand gibt revision_conflict', res.status === 409 && res.body.error === 'revision_conflict', res.body);
    h.check('ohne den Manifest-Hash des Hosts', res.body.details && res.body.details.currentManifestHash === null, res.body.details);

    res = await h.request({
        method: 'POST', url: `/api/cloud/instances/${UUID}/commit`, token: BOB,
        body: { manifest: manifestFor(UUID, [entry('mods/b.jar', modB)]), parentRevision: 2 }
    });
    h.check('Loeschen ist ohne Erlaubnis verboten', res.status === 403 && res.body.error === 'permission_denied'
        && res.body.details.denied.removeContent.includes('mods/a.jar'), res.body);

    res = await h.request({
        method: 'PATCH', url: `/api/cloud/instances/${UUID}/members/${bobId}`, token: HOST,
        body: { permissions: { removeContent: true } }
    });
    h.check('der Host erlaubt Bob das Loeschen',
        res.status === 200 && res.body.members.find((m) => m.username === 'bob').permissions.removeContent === true, res.body);

    res = await h.request({
        method: 'POST', url: `/api/cloud/instances/${UUID}/commit`, token: BOB,
        body: { manifest: manifestFor(UUID, [entry('mods/b.jar', modB)]), parentRevision: 2 }
    });
    h.check('danach kann Bob eine Mod entfernen', res.status === 201 && res.body.revision === 3, res.body);
    res = await h.request({ method: 'GET', url: `/api/cloud/instances/${UUID}/manifest`, token: HOST });
    h.check('a.jar ist weg, der Rest bleibt',
        !paths(res.body.manifest).includes('mods/a.jar') && paths(res.body.manifest).includes('options.txt'), paths(res.body.manifest));

    const stolen = Buffer.from('fremd'.repeat(20));
    await uploadBlob(CARL, stolen);
    const [claims] = await h.pool.query('DELETE FROM blob_upload_claims WHERE blob_hash = ? AND user_id = ?', [sha256(stolen), bobId]);
    void claims;
    res = await h.request({
        method: 'POST', url: `/api/cloud/instances/${UUID}/commit`, token: BOB,
        body: { manifest: manifestFor(UUID, [entry('mods/b.jar', modB), entry('mods/fremd.jar', stolen)]), parentRevision: 3 }
    });
    h.check('fremde Blobs bleiben auch fuer Mitglieder verboten', res.status === 403 && res.body.error === 'forbidden', res.body);

    h.section('3b) Rechte pro Mitglied');

    res = await h.request({ method: 'GET', url: `/api/cloud/instances/${UUID}/members`, token: BOB });
    h.check('Bob sieht seine eigenen Rechte', res.body.permissions && res.body.permissions.removeContent === true
        && res.body.permissions.rename === false, res.body.permissions);

    res = await h.request({
        method: 'PATCH', url: `/api/cloud/instances/${UUID}/members/${bobId}`, token: BOB,
        body: { permissions: { rename: true } }
    });
    h.check('ein Mitglied kann sich keine Rechte geben', res.status === 403, res.body);

    res = await h.request({
        method: 'PATCH', url: `/api/cloud/instances/${UUID}/members/${bobId}`, token: HOST,
        body: { permissions: { fliegen: true } }
    });
    h.check('unbekannte Rechte werden abgelehnt', res.status === 400, res.body);

    res = await h.request({ method: 'PATCH', url: `/api/cloud/instances/${UUID}/name`, token: BOB, body: { name: 'Bobs Pack' } });
    h.check('umbenennen ohne Recht geht nicht', res.status === 403, res.body);

    await h.request({
        method: 'PATCH', url: `/api/cloud/instances/${UUID}/members/${bobId}`, token: HOST,
        body: { permissions: { rename: true } }
    });
    res = await h.request({ method: 'PATCH', url: `/api/cloud/instances/${UUID}/name`, token: BOB, body: { name: 'Bobs Pack' } });
    h.check('mit Recht benennt Bob die Instanz um', res.status === 200 && res.body.name === 'Bobs Pack', res.body);

    // Der naechste Upload des Hosts traegt noch den alten Namen -- er darf die
    // Umbenennung nicht rueckgaengig machen.
    res = await h.request({ method: 'GET', url: `/api/cloud/instances/${UUID}/manifest`, token: HOST });
    const hostEntries = res.body.manifest.entries;
    res = await h.request({
        method: 'POST', url: `/api/cloud/instances/${UUID}/commit`, token: HOST,
        body: { manifest: { ...res.body.manifest, name: 'Team Pack' }, parentRevision: res.body.revision }
    });
    h.check('der Host-Upload wird angenommen', res.status === 201, res.body);
    h.check('und der neue Name bleibt', res.body.instance && res.body.instance.name === 'Bobs Pack', res.body.instance);
    void hostEntries;

    await h.request({
        method: 'PATCH', url: `/api/cloud/instances/${UUID}/members/${bobId}`, token: HOST,
        body: { permissions: { editConfig: false, addContent: false } }
    });
    res = await h.request({ method: 'GET', url: `/api/cloud/instances/${UUID}/manifest`, token: BOB });
    const bobView = res.body.manifest.entries.filter((e) => e.path !== 'instance.json');
    const cfg = Buffer.from('bob = true');
    await uploadBlob(BOB, cfg);
    res = await h.request({
        method: 'POST', url: `/api/cloud/instances/${UUID}/commit`, token: BOB,
        body: { manifest: manifestFor(UUID, [...bobView, entry('config/bob.toml', cfg)]), parentRevision: res.body.revision }
    });
    h.check('Configs aendern ohne Recht geht nicht', res.status === 403
        && res.body.details.denied.editConfig && res.body.details.denied.editConfig.includes('config/bob.toml'), res.body);

    res = await h.request({
        method: 'POST', url: `/api/cloud/instances/${UUID}/members`, token: BOB, body: { email: 'carl@example.com' }
    });
    h.check('einladen ohne Recht geht nicht', res.status === 403, res.body);

    await h.request({
        method: 'PATCH', url: `/api/cloud/instances/${UUID}/members/${bobId}`, token: HOST,
        body: { permissions: { manageMembers: true, addContent: true, editConfig: true } }
    });
    res = await h.request({
        method: 'POST', url: `/api/cloud/instances/${UUID}/members`, token: BOB, body: { email: 'carl@example.com' }
    });
    h.check('mit Recht laedt Bob Carl ein', res.status === 201 && res.body.members.some((m) => m.username === 'carl'), res.body);
    h.check('Carl bekommt die Standardrechte',
        res.body.members.find((m) => m.username === 'carl').permissions.removeContent === false, res.body.members);
    res = await h.request({
        method: 'POST', url: `/api/cloud/instances/${UUID}/members`, token: BOB,
        body: { email: 'eve@example.com', permissions: { removeContent: true } }
    });
    h.check('Rechte vergibt dabei nur der Host', res.status === 403, res.body);
    res = await h.request({ method: 'DELETE', url: `/api/cloud/instances/${UUID}/members/${carlId}`, token: BOB });
    h.check('und Bob kann Carl wieder entfernen', res.status === 200, res.body);
    await h.request({
        method: 'PATCH', url: `/api/cloud/instances/${UUID}/members/${bobId}`, token: HOST,
        body: { permissions: { manageMembers: false } }
    });

    h.section('4) Was nur der Host darf');

    res = await h.request({ method: 'POST', url: `/api/cloud/instances/${UUID}/revisions/1/rollback`, token: BOB });
    h.check('kein Rollback durch Mitglieder', res.status === 404, res.body);
    res = await h.request({ method: 'GET', url: `/api/cloud/instances/${UUID}/revisions`, token: BOB });
    h.check('keine Revisionsliste (sie enthaelt Manifest-Hashes)', res.status === 404, res.body);
    res = await h.request({ method: 'PATCH', url: `/api/cloud/instances/${UUID}`, token: BOB, body: { name: 'Meins' } });
    h.check('kein Umbenennen', res.status === 404, res.body);
    res = await h.request({ method: 'DELETE', url: `/api/cloud/instances/${UUID}`, token: BOB });
    h.check('kein Loeschen', res.status === 404, res.body);
    res = await h.request({ method: 'DELETE', url: `/api/cloud/instances/${UUID}/members/${hostId}`, token: BOB });
    h.check('niemand anderen entfernen', res.status === 403, res.body);

    h.section('5) Entfernen und Verlassen');

    await addMember(HOST, 'carl@example.com');
    res = await h.request({ method: 'DELETE', url: `/api/cloud/instances/${UUID}/members/${carlId}`, token: CARL });
    h.check('ein Mitglied kann die Instanz verlassen', res.status === 200 && res.body.left === true, res.body);

    res = await h.request({ method: 'DELETE', url: `/api/cloud/instances/${UUID}/members/${bobId}`, token: HOST });
    h.check('der Host entfernt ein Mitglied', res.status === 200 && res.body.members.length === 0, res.body);

    res = await h.request({ method: 'GET', url: `/api/cloud/instances/${UUID}/manifest`, token: BOB });
    h.check('danach ist die Instanz fuer Bob weg', res.status === 404, res.body);
    res = await h.request({ method: 'GET', url: '/api/cloud/shared', token: BOB });
    h.check('auch aus seiner Liste', (res.body.instances || []).length === 0, res.body);

    h.finish();
}

main().catch((err) => {
    console.error(err);
    h.stop();
    process.exit(1);
});
