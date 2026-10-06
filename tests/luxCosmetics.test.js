/* Lux Client mod cosmetics + cape marketplace with admin review.
   Run with: node tests/luxCosmetics.test.js */

const assert = require('assert');
const path = require('path');
const { Harness } = require('./luxcloudHarness');

const ALICE = 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1';
const BOB = 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2';

async function png(color, w = 64, h = 32) {
    const sharp = require('sharp');
    return sharp({ create: { width: w, height: h, channels: 4, background: color } }).png().toBuffer();
}

async function main() {
    const h = new Harness();
    // Mojang says yes for every name it knows.
    const known = { Alice: ALICE, Bob: BOB };
    const hasJoined = async (name) => (known[name] ? { uuid: known[name], name } : null);

    await h.start({
        mount: (app) => {
            const createLuxRouter = require(path.join(__dirname, '..', 'routes', 'luxCosmetics.js'));
            app.use('/api/lux', createLuxRouter({ hasJoined, imageDir: path.join(h.storageRoot, 'lux-capes') }));
        }
    });
    const conn = await h.pool.getConnection();
    await require(path.join(__dirname, '..', 'db_init_lux.js')).createLuxTables(conn);
    conn.release();

    let failures = 0;
    const test = async (name, fn) => {
        try {
            await fn();
            console.log(`  ok   ${name}`);
        } catch (err) {
            failures++;
            console.error(`  FAIL ${name}\n       ${err.stack}`);
        }
    };

    const login = async (name) => {
        const start = await h.request({ method: 'POST', url: '/api/lux/auth/start', body: { name } });
        assert.strictEqual(start.status, 200);
        const fin = await h.request({ method: 'POST', url: '/api/lux/auth/finish', body: { serverId: start.body.serverId } });
        return fin;
    };

    const uploaderId = await h.createUser({ googleId: 'g-up', username: 'capemaker' });
    const adminId = await h.createUser({ googleId: 'g-admin', username: 'boss' });
    await h.pool.query("UPDATE users SET role = 'admin' WHERE id = ?", [adminId]);
    const uploader = { id: uploaderId, username: 'capemaker', role: 'user' };
    const admin = { id: adminId, username: 'boss', role: 'admin' };

    let alice;
    let bob;
    let capeId;
    let marketHash;
    let ownHash;

    await test('mod sign-in needs a Mojang confirmation', async () => {
        const bad = await login('Mallory');
        assert.strictEqual(bad.status, 403);
        const a = await login('Alice');
        assert.strictEqual(a.status, 200);
        assert.strictEqual(a.body.uuid, ALICE);
        alice = a.body.token;
        bob = (await login('Bob')).body.token;
        const me = await h.request({ url: '/api/lux/me', token: alice });
        assert.strictEqual(me.body.name, 'Alice');
    });

    await test('name style and pattern cape are visible to other players right away', async () => {
        const res = await h.request({
            method: 'PUT', url: '/api/lux/me/profile', token: bob,
            body: { cape: { type: 'style', style: 3, c1: 0xff0000, c2: 0x00ff00, speed: 120 }, nameStyle: { color: 3, animation: 1 } }
        });
        assert.strictEqual(res.status, 200);
        const players = await h.request({ url: `/api/lux/players?uuids=${BOB},${ALICE}`, token: alice });
        assert.strictEqual(players.body.players[BOB].cape.style, 3);
        assert.strictEqual(players.body.players[BOB].nameStyle.color, 3);
    });

    await test('own picture from the game stays hidden until approved', async () => {
        const up = await h.request({ method: 'PUT', url: '/api/lux/me/cape-image', token: alice, body: await png('#ff00ff'), headers: { 'Content-Type': 'image/png' } });
        assert.strictEqual(up.status, 200, JSON.stringify(up.body));
        assert.strictEqual(up.body.status, 'pending');
        ownHash = up.body.hash;
        const prof = await h.request({ method: 'PUT', url: '/api/lux/me/profile', token: alice, body: { cape: { type: 'image', hash: ownHash } } });
        assert.strictEqual(prof.body.capeReview, 'pending');
        const seen = await h.request({ url: `/api/lux/players?uuids=${ALICE}`, token: bob });
        assert.strictEqual(seen.body.players[ALICE].cape, null);
        const anon = await h.request({ url: `/api/lux/images/${ownHash}.png`, raw: true });
        assert.strictEqual(anon.status, 404);
        const owner = await h.request({ url: `/api/lux/images/${ownHash}.png`, token: alice, raw: true });
        assert.strictEqual(owner.status, 200);
    });

    await test('nobody can wear somebody else\'s unreviewed picture', async () => {
        const res = await h.request({ method: 'PUT', url: '/api/lux/me/profile', token: bob, body: { cape: { type: 'image', hash: ownHash } } });
        assert.strictEqual(res.status, 400);
    });

    await test('rejects files that are not PNG', async () => {
        const res = await h.request({ method: 'PUT', url: '/api/lux/me/cape-image', token: alice, body: Buffer.from('GIF89a nope'), headers: { 'Content-Type': 'image/png' } });
        assert.strictEqual(res.status, 400);
    });

    await test('marketplace upload needs a website account and waits for review', async () => {
        h.setSessionUser(null);
        const anon = await h.request({ method: 'POST', url: '/api/lux/capes?title=Sunset', body: await png('#ff8800'), headers: { 'Content-Type': 'image/png' } });
        assert.strictEqual(anon.status, 401);
        h.setSessionUser(uploader);
        const res = await h.request({ method: 'POST', url: '/api/lux/capes?title=Sunset', body: await png('#ff8800'), headers: { 'Content-Type': 'image/png' } });
        assert.strictEqual(res.status, 201, JSON.stringify(res.body));
        assert.strictEqual(res.body.status, 'pending');
        capeId = res.body.id;
        marketHash = res.body.hash;
        const list = await h.request({ url: '/api/lux/capes' });
        assert.strictEqual(list.body.items.length, 0, 'pending cape must not be listed');
        const mine = await h.request({ url: '/api/lux/capes/mine' });
        assert.strictEqual(mine.body.items[0].status, 'pending');
        const preview = await h.request({ url: `/api/lux/images/${marketHash}.png`, raw: true });
        assert.strictEqual(preview.status, 200, 'uploader can preview their own pending cape');
    });

    await test('only admins see and work the review queue', async () => {
        h.setSessionUser(uploader);
        const denied = await h.request({ url: '/api/lux/admin/queue' });
        assert.strictEqual(denied.status, 403);
        const deniedApprove = await h.request({ method: 'POST', url: `/api/lux/admin/capes/${capeId}/approve`, body: {} });
        assert.strictEqual(deniedApprove.status, 403);
        h.setSessionUser(admin);
        const queue = await h.request({ url: '/api/lux/admin/queue' });
        assert.strictEqual(queue.body.capes.length, 1);
        assert.strictEqual(queue.body.images.length, 1);
        assert.strictEqual(queue.body.images[0].player, 'Alice');
        const img = await h.request({ url: `/api/lux/images/${ownHash}.png`, raw: true });
        assert.strictEqual(img.status, 200, 'admin can look at pending pictures');
    });

    await test('approving publishes the cape; the uploader is notified', async () => {
        h.setSessionUser(admin);
        const res = await h.request({ method: 'POST', url: `/api/lux/admin/capes/${capeId}/approve`, body: {} });
        assert.strictEqual(res.status, 200);
        h.setSessionUser(null);
        const list = await h.request({ url: '/api/lux/capes' });
        assert.strictEqual(list.body.items.length, 1);
        assert.strictEqual(list.body.items[0].author, 'capemaker');
        const img = await h.request({ url: `/api/lux/images/${marketHash}.png`, raw: true });
        assert.strictEqual(img.status, 200);
        const [notes] = await h.pool.query('SELECT message FROM notifications WHERE user_id = ?', [uploaderId]);
        assert.ok(notes.some((n) => /approved/.test(n.message)));
        const [log] = await h.pool.query("SELECT action FROM admin_audit_log WHERE action = 'lux_cape.approve'");
        assert.strictEqual(log.length, 1);
    });

    await test('link the Minecraft account from the game and wear a marketplace cape', async () => {
        const code = await h.request({ method: 'POST', url: '/api/lux/me/link-code', token: bob, body: {} });
        assert.strictEqual(code.status, 200);
        h.setSessionUser(uploader);
        const noLink = await h.request({ method: 'POST', url: `/api/lux/capes/${capeId}/use`, body: {} });
        assert.strictEqual(noLink.status, 400);
        const link = await h.request({ method: 'POST', url: '/api/lux/account/link', body: { code: code.body.code } });
        assert.strictEqual(link.status, 200);
        assert.strictEqual(link.body.player.name, 'Bob');
        const again = await h.request({ method: 'POST', url: '/api/lux/account/link', body: { code: code.body.code } });
        assert.strictEqual(again.status, 400, 'codes work once');
        const use = await h.request({ method: 'POST', url: `/api/lux/capes/${capeId}/use`, body: {} });
        assert.strictEqual(use.status, 200);
        const me = await h.request({ url: '/api/lux/me', token: bob });
        assert.strictEqual(me.body.cape.hash, marketHash);
        assert.strictEqual(me.body.linked, 'capemaker');
        const seen = await h.request({ url: `/api/lux/players?uuids=${BOB}`, token: alice });
        assert.strictEqual(seen.body.players[BOB].cape.hash, marketHash);
    });

    await test('removing an approved cape takes it off everybody', async () => {
        h.setSessionUser(admin);
        const res = await h.request({ method: 'POST', url: `/api/lux/admin/capes/${capeId}/reject`, body: { reason: 'Not allowed' } });
        assert.strictEqual(res.status, 200);
        const seen = await h.request({ url: `/api/lux/players?uuids=${BOB}`, token: alice });
        assert.strictEqual(seen.body.players[BOB].cape, null);
        h.setSessionUser(null);
        const list = await h.request({ url: '/api/lux/capes' });
        assert.strictEqual(list.body.items.length, 0);
        h.setSessionUser(uploader);
        const reup = await h.request({ method: 'POST', url: '/api/lux/capes?title=Again', body: await png('#ff8800'), headers: { 'Content-Type': 'image/png' } });
        assert.strictEqual(reup.status, 400, 'a rejected picture cannot simply be uploaded again');
    });

    await test('approving a picture from the game shows it to others', async () => {
        h.setSessionUser(admin);
        const res = await h.request({ method: 'POST', url: `/api/lux/admin/images/${ownHash}/approve`, body: {} });
        assert.strictEqual(res.status, 200);
        const seen = await h.request({ url: `/api/lux/players?uuids=${ALICE}`, token: bob });
        assert.strictEqual(seen.body.players[ALICE].cape.hash, ownHash);
    });

    h.stop();
    if (failures) {
        console.error(`\n${failures} test(s) failed`);
        process.exit(1);
    }
    console.log('\nall lux cosmetics tests passed');
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
