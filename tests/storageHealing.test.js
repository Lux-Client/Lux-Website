const crypto = require('crypto');
const fsp = require('fs/promises');
const path = require('path');

const { Harness } = require('./luxcloudHarness');

const h = new Harness();

function sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

function objectPath(hash) {
    return path.join(process.env.LUXCLOUD_FS_ROOT, 'blobs', hash.slice(0, 2), hash.slice(2, 4), hash);
}

async function exists(file) {
    try {
        await fsp.access(file);
        return true;
    } catch {
        return false;
    }
}

function manifestFor(instanceUuid, entries, overrides = {}) {
    return {
        manifestVersion: 1,
        instanceId: instanceUuid,
        name: 'Skyblock',
        createdAt: 1756582980000,
        runtime: { mcVersion: '1.21.11', loader: 'fabric', loaderVersion: '0.19.3' },
        entries,
        ...overrides
    };
}

async function main() {
    await h.start();

    const userA = await h.createUser({ googleId: 'g-a', username: 'beatv' });
    const sessionA = { id: userA, username: 'beatv', role: 'user', banned: false };
    const A = (await h.authorizeDevice({ user: sessionA, deviceUuid: 'dev-aaaa-0001' })).accessToken;

    const UUID = 'inst-healing-001';
    let res = await h.request({
        method: 'POST',
        url: '/api/cloud/instances',
        token: A,
        body: { instanceUuid: UUID, name: 'Skyblock' }
    });
    h.check('Instanz angelegt', res.status === 201, res.body);

    h.section('1) Ein Blob, dessen Datei verschwunden ist');

    const payload = Buffer.from('eine config, die spaeter aus dem Speicher faellt\n'.repeat(20));
    const hash = sha256(payload);

    res = await h.request({
        method: 'PUT',
        url: `/api/cloud/blobs/${hash}`,
        token: A,
        body: payload,
        headers: { 'X-Lux-Compression': 'none' }
    });
    h.check('erster Upload -> 201', res.status === 201, res.body);
    h.check('Objekt liegt im Speicher', await exists(objectPath(hash)));

    res = await h.request({
        method: 'PUT',
        url: `/api/cloud/blobs/${hash}`,
        token: A,
        body: payload,
        headers: { 'X-Lux-Compression': 'none' }
    });
    h.check('zweiter Upload -> 409 already_exists',
        res.status === 409 && res.body.error === 'already_exists', res.body);

    await fsp.rm(objectPath(hash), { force: true });
    h.check('Datei aus dem Speicher entfernt, DB-Zeile bleibt', !(await exists(objectPath(hash))));

    const [rowStillThere] = await h.pool.query('SELECT hash FROM blobs WHERE hash = ?', [hash]);
    h.check('die blobs-Zeile existiert weiterhin', rowStillThere.length === 1, rowStillThere);

    res = await h.request({
        method: 'PUT',
        url: `/api/cloud/blobs/${hash}`,
        token: A,
        body: payload,
        headers: { 'X-Lux-Compression': 'none' }
    });
    h.check('erneuter Upload wird angenommen statt mit 409 abgewiesen', res.status === 201, res.body);
    h.check('das Objekt ist wieder da', await exists(objectPath(hash)));

    res = await h.request({ url: `/api/cloud/blobs/${hash}`, token: A, raw: true });
    h.check('der geheilte Blob laesst sich byte-genau laden',
        res.status === 200 && Buffer.compare(res.body, payload) === 0, res.status);

    h.section('2) Ein Manifest, dessen Datei verschwunden ist');

    const entries = [{
        path: 'config/options.json',
        size: payload.length,
        mtime: 1756582980000,
        sha256: hash,
        blob: hash
    }];

    res = await h.request({
        method: 'POST',
        url: `/api/cloud/instances/${UUID}/commit`,
        token: A,
        body: { manifest: manifestFor(UUID, entries), parentRevision: 0 }
    });
    h.check('Commit -> Revision 1', res.status === 201 && res.body.revision === 1, res.body);
    const manifestHash = res.body.manifestHash;
    h.check('das Manifest liegt im Speicher', await exists(objectPath(manifestHash)));

    res = await h.request({ url: `/api/cloud/instances/${UUID}/manifest`, token: A });
    h.check('Manifest laesst sich lesen', res.status === 200 && res.body.manifest.instanceId === UUID, res.body);

    await fsp.rm(objectPath(manifestHash), { force: true });

    res = await h.request({ url: `/api/cloud/instances/${UUID}/manifest`, token: A });
    h.check('fehlendes Manifest -> 410 manifest_missing statt 500',
        res.status === 410 && res.body.error === 'manifest_missing', res.body);
    h.check('die Fehlermeldung nennt den Hash',
        res.body.details && res.body.details.manifestHash === manifestHash, res.body.details);

    res = await h.request({
        method: 'POST',
        url: `/api/cloud/instances/${UUID}/commit`,
        token: A,
        body: { manifest: manifestFor(UUID, entries), parentRevision: 1 }
    });
    h.check('ein erneuter Commit mit identischem Inhalt geht durch', res.status === 201, res.body);
    h.check('und schreibt das Manifest zurueck in den Speicher', await exists(objectPath(manifestHash)));

    res = await h.request({ url: `/api/cloud/instances/${UUID}/manifest`, token: A });
    h.check('das Manifest ist wieder lesbar', res.status === 200, res.body);

    res = await h.request({ url: `/api/cloud/instances/${UUID}/manifest?revision=1`, token: A });
    h.check('auch die alte Revision zeigt wieder auf dasselbe, geheilte Manifest',
        res.status === 200 && res.body.manifestHash === manifestHash, res.body);

    h.section('3) negotiate meldet verschwundene Dateien wieder als fehlend');

    const second = Buffer.from('eine zweite datei '.repeat(50));
    const secondHash = sha256(second);

    res = await h.request({
        method: 'PUT',
        url: `/api/cloud/blobs/${secondHash}`,
        token: A,
        body: second,
        headers: { 'X-Lux-Compression': 'none' }
    });
    h.check('zweite Datei hochgeladen', res.status === 201, res.body);

    res = await h.request({
        method: 'POST',
        url: `/api/cloud/instances/${UUID}/negotiate`,
        token: A,
        body: { blobs: [{ hash: secondHash, size: second.length }] }
    });
    h.check('negotiate kennt die Datei', res.status === 200 && res.body.known.includes(secondHash), res.body);

    await fsp.rm(objectPath(secondHash), { force: true });

    res = await h.request({
        method: 'POST',
        url: `/api/cloud/instances/${UUID}/negotiate`,
        token: A,
        body: { blobs: [{ hash: secondHash, size: second.length }] }
    });
    h.check('nach dem Verlust verlangt negotiate die Datei erneut',
        res.status === 200 && res.body.missing.includes(secondHash), res.body);
    h.check('und meldet sie nicht mehr als bekannt',
        !res.body.known.includes(secondHash), res.body.known);

    h.finish();
}

main().catch((err) => {
    console.error(err);
    h.stop();
    process.exit(1);
});
