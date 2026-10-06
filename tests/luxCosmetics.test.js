/* Lux Client mod cosmetics + cape marketplace with admin review.
   Run with: node tests/luxCosmetics.test.js */

const assert = require('assert');
const path = require('path');
const { Harness } = require('./luxcloudHarness');

const ALICE = 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1';
const BOB = 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2';
const WINNER = 'c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3';

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
            const lookupName = async (name) => (name.toLowerCase() === 'winner' ? { uuid: WINNER, name: 'Winner' } : null);
            app.use('/api/lux', createLuxRouter({ hasJoined, lookupName, imageDir: path.join(h.storageRoot, 'lux-capes') }));
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

    const grant = async (uuid, items) => {
        for (const item of items) {
            await h.pool.query('INSERT INTO lux_owned (uuid, item, price, source, acquired_at) VALUES (?, ?, ?, ?, ?) RETURNING uuid',
                [uuid, item, 0, 'test', Date.now()]);
        }
    };

    await test('locked name styles and cosmetics are not shared until unlocked', async () => {
        const res = await h.request({
            method: 'PUT', url: '/api/lux/me/profile', token: bob,
            body: { nameStyle: { color: 3, animation: 1, line: 'twitch.tv/bob' }, cosmetics: { head: { id: 'crown' }, neck: { id: 'bow_tie' } } }
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.nameStyle.color, 0);
        assert.strictEqual(res.body.nameStyle.animation, 0);
        assert.strictEqual(res.body.nameStyle.line, undefined);
        assert.deepStrictEqual(res.body.cosmetics, { neck: { id: 'bow_tie' } }, 'free bow tie stays, locked crown goes');
        assert.ok(res.body.warnings.length >= 3);
        await grant(BOB, ['name:color:3', 'name:anim:1', 'name:line', 'cosmetic:top_hat', 'cosmetic:angel_wings']);
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

    await test('cosmetics are shared with other players and checked', async () => {
        const cosmetics = { head: { id: 'top_hat', color: 0x112233 }, wings: { id: 'angel_wings', rainbow: true }, bogus: { id: 'x' } };
        const line = await h.request({
            method: 'PUT', url: '/api/lux/me/profile', token: bob,
            body: { nameStyle: { color: 3, animation: 1, line: '  §cTwitch:\u0007   bob_live  ' } }
        });
        assert.strictEqual(line.body.nameStyle.line, 'Twitch: bob_live', 'colour codes and control characters are removed');
        const res = await h.request({ method: 'PUT', url: '/api/lux/me/profile', token: bob, body: { cosmetics } });
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(res.body.cosmetics, { head: { id: 'top_hat', color: 0x112233 }, wings: { id: 'angel_wings', rainbow: true } });
        const seen = await h.request({ url: `/api/lux/players?uuids=${BOB}`, token: alice });
        assert.strictEqual(seen.body.players[BOB].cosmetics.head.id, 'top_hat');
        const bad = await h.request({ method: 'PUT', url: '/api/lux/me/profile', token: bob, body: { cosmetics: { head: { id: '<script>' } } } });
        assert.strictEqual(bad.status, 200);
        assert.ok(bad.body.warnings && /cosmetics/.test(bad.body.warnings[0]));
        assert.strictEqual(bad.body.cosmetics, null, 'invalid cosmetics are not stored');
    });

    await test('live poll tells who uses Lux, when the profile changed and the emote', async () => {
        const first = await h.request({ method: 'POST', url: '/api/lux/live', token: alice, body: { uuids: [ALICE, BOB, WINNER] } });
        assert.strictEqual(first.status, 200);
        assert.ok(first.body.players[BOB], 'bob is online');
        assert.strictEqual(first.body.players[WINNER], undefined, 'unknown players are not listed');
        const rev = first.body.players[BOB].rev;
        await h.request({ method: 'PUT', url: '/api/lux/me/profile', token: bob, body: { cosmetics: { head: { id: 'top_hat' } } } });
        const second = await h.request({ method: 'POST', url: '/api/lux/live', token: alice, body: { uuids: [BOB] } });
        assert.ok(second.body.players[BOB].rev > rev, 'rev goes up when the profile changes');
        const same = await h.request({ method: 'PUT', url: '/api/lux/me/profile', token: bob, body: { cosmetics: { head: { id: 'top_hat' } } } });
        const third = await h.request({ method: 'POST', url: '/api/lux/live', token: alice, body: { uuids: [BOB] } });
        assert.strictEqual(third.body.players[BOB].rev, second.body.players[BOB].rev, 'unchanged profile keeps rev');
        assert.strictEqual(same.status, 200);
        const players = await h.request({ url: `/api/lux/players?uuids=${BOB}`, token: alice });
        assert.strictEqual(players.headers['cache-control'], 'no-store');
    });

    await test('locked emotes cannot be played; duo emotes carry the partner', async () => {
        const locked = await h.request({ method: 'POST', url: '/api/lux/me/emote', token: alice, body: { emote: 'dance' } });
        assert.strictEqual(locked.status, 403);
        await grant(ALICE, ['emote:high_five']);
        const bobAlone = await h.request({ method: 'POST', url: '/api/lux/me/emote', token: bob, body: { emote: 'high_five' } });
        assert.strictEqual(bobAlone.status, 403, 'starting a partner emote needs it unlocked');
        await h.request({ method: 'POST', url: '/api/lux/me/emote', token: alice, body: { emote: 'high_five' } });
        const join = await h.request({ method: 'POST', url: '/api/lux/me/emote', token: bob, body: { emote: 'high_five', partner: ALICE } });
        assert.strictEqual(join.status, 200, 'joining is free');
        const live = await h.request({ method: 'POST', url: '/api/lux/live', token: alice, body: { uuids: [ALICE, BOB] } });
        assert.strictEqual(live.body.players[ALICE].emote.id, 'high_five');
        assert.strictEqual(live.body.players[ALICE].emote.partner, null);
        assert.strictEqual(live.body.players[BOB].emote.partner, ALICE);
        await h.request({ method: 'POST', url: '/api/lux/me/emote', token: alice, body: { emote: null } });
        await h.request({ method: 'POST', url: '/api/lux/me/emote', token: bob, body: { emote: null } });
    });

    await test('emotes reach the players around you and can be stopped', async () => {
        const start = await h.request({ method: 'POST', url: '/api/lux/me/emote', token: alice, body: { emote: 'wave' } });
        assert.strictEqual(start.status, 200);
        const seen = await h.request({ url: `/api/lux/emotes?uuids=${ALICE},${BOB}` });
        assert.strictEqual(seen.body.emotes[ALICE].id, 'wave');
        assert.ok(seen.body.emotes[ALICE].age >= 0);
        assert.strictEqual(seen.body.emotes[BOB], undefined);
        await h.request({ method: 'POST', url: '/api/lux/me/emote', token: alice, body: { emote: null } });
        const after = await h.request({ url: `/api/lux/emotes?uuids=${ALICE}` });
        assert.deepStrictEqual(after.body.emotes, {});
        const anon = await h.request({ method: 'POST', url: '/api/lux/me/emote', body: { emote: 'wave' } });
        assert.strictEqual(anon.status, 401);
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

    await test('nobody can wear somebody else\'s unreviewed picture (the rest of the profile still counts)', async () => {
        const res = await h.request({
            method: 'PUT', url: '/api/lux/me/profile', token: bob,
            body: { cape: { type: 'image', hash: ownHash }, cosmetics: { head: { id: 'top_hat' } } }
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.cape, null);
        assert.ok(res.body.warnings && /cape/.test(res.body.warnings[0]));
        assert.strictEqual(res.body.cosmetics.head.id, 'top_hat');
    });

    await test('the same picture uploaded by a second player is theirs too', async () => {
        const up = await h.request({ method: 'PUT', url: '/api/lux/me/cape-image', token: bob, body: await png('#ff00ff'), headers: { 'Content-Type': 'image/png' } });
        assert.strictEqual(up.body.hash, ownHash);
        const res = await h.request({ method: 'PUT', url: '/api/lux/me/profile', token: bob, body: { cape: { type: 'image', hash: ownHash } } });
        assert.strictEqual(res.body.cape.hash, ownHash);
        assert.strictEqual(res.body.capeReview, 'pending');
        const seen = await h.request({ url: `/api/lux/players?uuids=${BOB}`, token: alice });
        assert.strictEqual(seen.body.players[BOB].cape, null, 'still hidden from others until approved');
        await h.request({ method: 'PUT', url: '/api/lux/me/profile', token: bob, body: { cape: null } });
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

    await test('shop: prices, not enough credits, buying, owning twice', async () => {
        const s1 = await h.request({ url: '/api/lux/shop', token: alice });
        assert.strictEqual(s1.body.credits, 0);
        assert.strictEqual(s1.body.prices['emote:dance'], 3000);
        const poor = await h.request({ method: 'POST', url: '/api/lux/shop/buy', token: alice, body: { item: 'emote:dance' } });
        assert.strictEqual(poor.status, 400);
        const nope = await h.request({ method: 'POST', url: '/api/lux/shop/buy', token: alice, body: { item: 'cosmetic:does_not_exist' } });
        assert.strictEqual(nope.status, 404);
        await h.pool.query('UPDATE lux_players SET credits = 5000 WHERE uuid = ?', [ALICE]);
        const ok = await h.request({ method: 'POST', url: '/api/lux/shop/buy', token: alice, body: { item: 'emote:dance' } });
        assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
        assert.strictEqual(ok.body.credits, 2000);
        assert.ok(ok.body.owned.includes('emote:dance'));
        const twice = await h.request({ method: 'POST', url: '/api/lux/shop/buy', token: alice, body: { item: 'emote:dance' } });
        assert.strictEqual(twice.status, 400);
        const free = await h.request({ method: 'POST', url: '/api/lux/shop/buy', token: alice, body: { item: 'emote:wave' } });
        assert.strictEqual(free.status, 400, 'free items are already owned');
        const dance = await h.request({ method: 'POST', url: '/api/lux/me/emote', token: alice, body: { emote: 'dance' } });
        assert.strictEqual(dance.status, 200);
        const [log] = await h.pool.query('SELECT delta FROM lux_credit_log WHERE uuid = ?', [ALICE]);
        assert.ok(log.some((l) => Number(l.delta) === -3000));
    });

    await test('admin: give credits by Minecraft name, look up, revoke, reset line', async () => {
        h.setSessionUser(uploader);
        const denied = await h.request({ method: 'POST', url: '/api/lux/admin/credits/give', body: { name: 'Bob', amount: 100 } });
        assert.strictEqual(denied.status, 403);
        h.setSessionUser(admin);
        const give = await h.request({ method: 'POST', url: '/api/lux/admin/credits/give', body: { name: 'bob', amount: 750, reason: 'Giveaway #1' } });
        assert.strictEqual(give.status, 200, JSON.stringify(give.body));
        assert.strictEqual(give.body.credits, 750);
        const stranger = await h.request({ method: 'POST', url: '/api/lux/admin/credits/give', body: { name: 'Winner', amount: 1000 } });
        assert.strictEqual(stranger.status, 200, 'unknown names are looked up at Mojang');
        assert.strictEqual(stranger.body.uuid, WINNER);
        const missingName = await h.request({ method: 'POST', url: '/api/lux/admin/credits/give', body: { name: 'NoSuchPlayer', amount: 5 } });
        assert.strictEqual(missingName.status, 404);
        const look = await h.request({ url: '/api/lux/admin/players?name=Bob' });
        assert.strictEqual(look.body.credits, 750);
        assert.ok(look.body.owned.some((o) => o.item === 'cosmetic:top_hat'));
        assert.strictEqual(look.body.nameStyle.line, 'Twitch: bob_live');
        const minus = await h.request({ method: 'POST', url: `/api/lux/admin/players/${BOB}/credits`, body: { delta: -1000, reason: 'oops' } });
        assert.strictEqual(minus.body.credits, 0, 'never below zero');
        await h.request({ method: 'POST', url: `/api/lux/admin/players/${BOB}/revoke`, body: { item: 'cosmetic:top_hat' } });
        await h.request({ method: 'POST', url: `/api/lux/admin/players/${BOB}/reset-line`, body: {} });
        const after = await h.request({ url: `/api/lux/admin/players/${BOB}` });
        assert.ok(!after.body.owned.some((o) => o.item === 'cosmetic:top_hat'));
        assert.strictEqual(after.body.cosmetics.head, undefined, 'revoked hat is taken off');
        assert.strictEqual(after.body.nameStyle.line, undefined);
        const grantRes = await h.request({ method: 'POST', url: `/api/lux/admin/players/${BOB}/grant`, body: { item: 'emote:hug' } });
        assert.strictEqual(grantRes.status, 200);
        const [audits] = await h.pool.query("SELECT action FROM admin_audit_log WHERE action LIKE 'lux_%'");
        assert.ok(audits.some((a) => a.action === 'lux_credits.add'));
        h.setSessionUser(null);
    });

    await test('admin prices: change, take off sale, reset - shop and /live see it at once', async () => {
        h.setSessionUser(uploader);
        const denied = await h.request({ method: 'PUT', url: '/api/lux/admin/prices', body: { item: 'emote:dance', price: 1 } });
        assert.strictEqual(denied.status, 403);
        h.setSessionUser(admin);
        const list = await h.request({ url: '/api/lux/admin/prices' });
        assert.strictEqual(list.status, 200);
        const dance = list.body.items.find((i) => i.item === 'emote:dance');
        assert.ok(dance && dance.name && dance.category === 'Emotes');
        const before = await h.request({ method: 'POST', url: '/api/lux/live', token: alice, body: { uuids: [ALICE] } });
        const set = await h.request({ method: 'PUT', url: '/api/lux/admin/prices', body: { item: 'emote:dance', price: 7 } });
        assert.strictEqual(set.status, 200, JSON.stringify(set.body));
        const after = await h.request({ method: 'POST', url: '/api/lux/live', token: alice, body: { uuids: [ALICE] } });
        assert.ok(after.body.shop > before.body.shop, 'price version goes up');
        const shopRes = await h.request({ url: '/api/lux/shop', token: alice });
        assert.strictEqual(shopRes.body.prices['emote:dance'], 7);
        const free = await h.request({ method: 'PUT', url: '/api/lux/admin/prices', body: { item: 'emote:clap', price: 0 } });
        assert.strictEqual(free.status, 200);
        const emoteOk = await h.request({ method: 'POST', url: '/api/lux/me/emote', token: alice, body: { emote: 'clap' } });
        assert.strictEqual(emoteOk.status, 200, 'price 0 = free for everybody');
        await h.request({ method: 'PUT', url: '/api/lux/admin/prices', body: { item: 'emote:dance', forSale: false } });
        const off = await h.request({ method: 'POST', url: '/api/lux/shop/buy', token: alice, body: { item: 'emote:dance' } });
        assert.strictEqual(off.status, 404, 'not for sale');
        await h.request({ method: 'PUT', url: '/api/lux/admin/prices', body: { item: 'emote:dance', price: null } });
        const reset = await h.request({ url: '/api/lux/shop', token: alice });
        assert.strictEqual(reset.body.prices['emote:dance'], 3000, 'back to the default');
        const bad = await h.request({ method: 'PUT', url: '/api/lux/admin/prices', body: { item: 'emote:dance', price: -5 } });
        assert.strictEqual(bad.status, 400);
        h.setSessionUser(null);
    });

    await test('gifts: pay for someone else, they own it and see a pop-up once', async () => {
        h.setSessionUser(admin);
        await h.request({ method: 'POST', url: '/api/lux/admin/credits/give', body: { name: 'Alice', amount: 5000 } });
        h.setSessionUser(null);
        await h.request({ method: 'POST', url: `/api/lux/admin/players/${BOB}/revoke`, body: { item: 'emote:floss' } });
        const before = (await h.request({ url: '/api/lux/shop', token: alice })).body.credits;
        const gift = await h.request({ method: 'POST', url: '/api/lux/shop/gift', token: alice, body: { item: 'emote:floss', name: 'bob' } });
        assert.strictEqual(gift.status, 200, JSON.stringify(gift.body));
        assert.strictEqual(gift.body.credits, before - 3000);
        const bobShop = await h.request({ url: '/api/lux/shop', token: bob });
        assert.ok(bobShop.body.owned.includes('emote:floss'), 'receiver owns it');
        const again = await h.request({ method: 'POST', url: '/api/lux/shop/gift', token: alice, body: { item: 'emote:floss', name: 'Bob' } });
        assert.strictEqual(again.status, 400, 'already has it');
        const nobody = await h.request({ method: 'POST', url: '/api/lux/shop/gift', token: alice, body: { item: 'emote:floss', name: 'Winner' } });
        assert.strictEqual(nobody.status, 404, 'only Lux players');
        const self = await h.request({ method: 'POST', url: '/api/lux/shop/gift', token: alice, body: { item: 'emote:robot', name: 'Alice' } });
        assert.strictEqual(self.status, 400);
        const me = await h.request({ url: '/api/lux/me', token: bob });
        assert.strictEqual(me.body.gifts.length, 1);
        assert.strictEqual(me.body.gifts[0].from, 'Alice');
        assert.strictEqual(me.body.gifts[0].item, 'emote:floss');
        await h.request({ method: 'POST', url: '/api/lux/me/gifts/seen', token: bob, body: { ids: [me.body.gifts[0].id] } });
        const after = await h.request({ url: '/api/lux/me', token: bob });
        assert.strictEqual(after.body.gifts.length, 0, 'pop-up only once');
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
