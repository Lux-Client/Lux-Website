/* Lux Client mod: friends, chat, invites, blocking and the admin social ban.
   Run with: node tests/luxFriends.test.js */

const assert = require('assert');
const path = require('path');
const { Harness } = require('./luxcloudHarness');

const ALICE = 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1';
const BOB = 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2';
const CAROL = 'c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0';
const DAVE = 'd4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4';

async function main() {
    const h = new Harness();
    const known = { Alice: ALICE, Bob: BOB, Carol: CAROL, Dave: DAVE };
    const hasJoined = async (name) => (known[name] ? { uuid: known[name], name } : null);
    await h.start({
        mount: (app) => {
            const createLuxRouter = require(path.join(__dirname, '..', 'routes', 'luxCosmetics.js'));
            app.use('/api/lux', createLuxRouter({ hasJoined, lookupName: async () => null, imageDir: path.join(h.storageRoot, 'lux-capes') }));
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
        const fin = await h.request({ method: 'POST', url: '/api/lux/auth/finish', body: { serverId: start.body.serverId } });
        assert.strictEqual(fin.status, 200);
        return fin.body.token;
    };
    const api = (token, method, url, body) => h.request({ method, url: `/api/lux${url}`, body, token });

    const alice = await login('Alice');
    const bob = await login('Bob');
    const carol = await login('Carol');
    const dave = await login('Dave');

    await test('friend request by name, unknown names are refused', async () => {
        const unknown = await api(alice, 'POST', '/friends/request', { name: 'Nobody' });
        assert.strictEqual(unknown.status, 404);
        const self = await api(alice, 'POST', '/friends/request', { name: 'alice' });
        assert.strictEqual(self.status, 400);
        const r = await api(alice, 'POST', '/friends/request', { name: 'bob' });
        assert.strictEqual(r.status, 200);
        assert.strictEqual(r.body.friends, false);
        const bobView = await api(bob, 'GET', '/friends');
        assert.deepStrictEqual(bobView.body.incoming.map((i) => i.name), ['Alice']);
        const aliceView = await api(alice, 'GET', '/friends');
        assert.deepStrictEqual(aliceView.body.outgoing.map((i) => i.name), ['Bob']);
    });

    await test('accepting makes both friends, a request back counts as yes', async () => {
        const acc = await api(bob, 'POST', '/friends/accept', { uuid: ALICE });
        assert.strictEqual(acc.status, 200);
        const a = await api(alice, 'GET', '/friends');
        assert.deepStrictEqual(a.body.friends.map((f) => f.name), ['Bob']);
        assert.strictEqual(a.body.outgoing.length, 0);
        const again = await api(alice, 'POST', '/friends/request', { name: 'Bob' });
        assert.strictEqual(again.status, 409);
        await api(carol, 'POST', '/friends/request', { name: 'Alice' });
        const mutual = await api(alice, 'POST', '/friends/request', { name: 'Carol' });
        assert.strictEqual(mutual.body.friends, true);
    });

    await test('heartbeat shows online status and activity to friends only', async () => {
        await api(bob, 'POST', '/friends/poll', { kind: 'server', version: '1.21.11', server: 'Hypixel', address: 'mc.hypixel.net', since: 0 });
        const a = await api(alice, 'GET', '/friends');
        const b = a.body.friends.find((f) => f.name === 'Bob');
        assert.strictEqual(b.online, true);
        assert.deepStrictEqual(b.activity, { kind: 'server', version: '1.21.11', server: 'Hypixel' });
        assert.ok(!('address' in b.activity), 'the address is not shown to friends');
        const c = a.body.friends.find((f) => f.name === 'Carol');
        assert.strictEqual(c.online, false);
        // Dave is no friend and cannot read chats
        const no = await api(dave, 'GET', `/friends/messages/${BOB}`);
        assert.strictEqual(no.status, 403);
    });

    await test('messages: only between friends, unread counts, delivered by the heartbeat', async () => {
        const first = await api(alice, 'POST', '/friends/poll', { kind: 'menu', since: 0 });
        const since = first.body.lastId;
        const sent = await api(bob, 'POST', `/friends/messages/${ALICE}`, { text: 'hi Alice §cred' });
        assert.strictEqual(sent.status, 200);
        assert.strictEqual(sent.body.message.text, 'hi Alice red', 'formatting codes are removed');
        const poll = await api(alice, 'POST', '/friends/poll', { kind: 'menu', since });
        assert.strictEqual(poll.body.messages.length, 1);
        assert.strictEqual(poll.body.messages[0].from, BOB);
        assert.strictEqual(poll.body.unread, 1);
        const list = await api(alice, 'GET', '/friends');
        assert.strictEqual(list.body.friends.find((f) => f.name === 'Bob').unread, 1);
        const chat = await api(alice, 'GET', `/friends/messages/${BOB}`);
        assert.strictEqual(chat.body.messages.length, 1);
        assert.ok(chat.body.messages[0].at > 0);
        const after = await api(alice, 'POST', '/friends/poll', { kind: 'menu', since: poll.body.lastId });
        assert.strictEqual(after.body.unread, 0, 'opening the chat marks it read');
        const stranger = await api(dave, 'POST', `/friends/messages/${ALICE}`, { text: 'hey' });
        assert.strictEqual(stranger.status, 403);
        const long = await api(bob, 'POST', `/friends/messages/${ALICE}`, { text: 'x'.repeat(501) });
        assert.strictEqual(long.status, 400);
    });

    await test('invites only from a server and expire when the sender leaves it', async () => {
        const fromMenu = await api(alice, 'POST', `/friends/invite/${BOB}`, {});
        assert.strictEqual(fromMenu.status, 400);
        await api(bob, 'POST', '/friends/poll', { kind: 'server', server: 'GommeHD', address: 'gommehd.net', since: 0 });
        const inv = await api(bob, 'POST', `/friends/invite/${ALICE}`, {});
        assert.strictEqual(inv.status, 200);
        assert.strictEqual(inv.body.message.kind, 'invite');
        assert.strictEqual(inv.body.message.server, 'GommeHD');
        let chat = await api(alice, 'GET', `/friends/messages/${BOB}`);
        let last = chat.body.messages[chat.body.messages.length - 1];
        assert.strictEqual(last.active, true);
        assert.strictEqual(last.address, 'gommehd.net');
        await api(bob, 'POST', '/friends/poll', { kind: 'menu', since: 0 });
        chat = await api(alice, 'GET', `/friends/messages/${BOB}`);
        last = chat.body.messages[chat.body.messages.length - 1];
        assert.strictEqual(last.active, false, 'sender left the server');
        // coming back later does not revive the old invite
        await api(bob, 'POST', '/friends/poll', { kind: 'server', server: 'GommeHD', address: 'gommehd.net', since: 0 });
        chat = await api(alice, 'GET', `/friends/messages/${BOB}`);
        last = chat.body.messages[chat.body.messages.length - 1];
        assert.strictEqual(last.active, false);
    });

    await test('mute is remembered, block ends the friendship and stops requests', async () => {
        await api(alice, 'POST', '/friends/mute', { uuid: CAROL, muted: true });
        let a = await api(alice, 'GET', '/friends');
        assert.strictEqual(a.body.friends.find((f) => f.name === 'Carol').muted, true);
        await api(alice, 'POST', '/friends/mute', { uuid: CAROL, muted: false });
        a = await api(alice, 'GET', '/friends');
        assert.strictEqual(a.body.friends.find((f) => f.name === 'Carol').muted, false);

        const blk = await api(alice, 'POST', '/friends/block', { uuid: CAROL });
        assert.strictEqual(blk.status, 200);
        a = await api(alice, 'GET', '/friends');
        assert.ok(!a.body.friends.some((f) => f.name === 'Carol'));
        assert.deepStrictEqual(a.body.blocked.map((b) => b.name), ['Carol']);
        const req = await api(carol, 'POST', '/friends/request', { name: 'Alice' });
        assert.strictEqual(req.status, 403);
        const msg = await api(carol, 'POST', `/friends/messages/${ALICE}`, { text: 'hey' });
        assert.strictEqual(msg.status, 403);
        await api(alice, 'POST', '/friends/unblock', { uuid: CAROL });
        const req2 = await api(carol, 'POST', '/friends/request', { name: 'Alice' });
        assert.strictEqual(req2.status, 200);
        const dec = await api(alice, 'POST', '/friends/decline', { uuid: CAROL });
        assert.strictEqual(dec.status, 200);
        a = await api(alice, 'GET', '/friends');
        assert.strictEqual(a.body.incoming.length, 0);
    });

    await test('admins can ban a player from friends and chat', async () => {
        const adminId = await h.createUser({ googleId: 'g-admin', username: 'boss' });
        await h.pool.query("UPDATE users SET role = 'admin' WHERE id = ?", [adminId]);
        const denied = await h.request({ method: 'POST', url: `/api/lux/admin/players/${BOB}/social-ban`, body: {} });
        assert.strictEqual(denied.status, 403);
        h.setSessionUser({ id: adminId, username: 'boss', role: 'admin' });
        const ban = await h.request({ method: 'POST', url: `/api/lux/admin/players/${BOB}/social-ban`, body: { reason: 'Spam' } });
        assert.strictEqual(ban.status, 200);
        const panel = await h.request({ url: `/api/lux/admin/players/${BOB}` });
        assert.strictEqual(panel.body.socialBan.reason, 'Spam');
        const bans = await h.request({ url: '/api/lux/admin/social-bans' });
        assert.deepStrictEqual(bans.body.bans.map((b) => b.name), ['Bob']);

        const view = await api(bob, 'GET', '/friends');
        assert.strictEqual(view.body.banned, true);
        const send = await api(bob, 'POST', `/friends/messages/${ALICE}`, { text: 'hi' });
        assert.strictEqual(send.status, 403);
        const toBob = await api(alice, 'POST', `/friends/messages/${BOB}`, { text: 'hi' });
        assert.strictEqual(toBob.status, 403);
        const a = await api(alice, 'GET', '/friends');
        assert.strictEqual(a.body.friends.find((f) => f.name === 'Bob').online, false, 'banned players look offline');

        const unban = await h.request({ method: 'DELETE', url: `/api/lux/admin/players/${BOB}/social-ban` });
        assert.strictEqual(unban.status, 200);
        h.setSessionUser(null);
        const back = await api(bob, 'POST', `/friends/messages/${ALICE}`, { text: 'back' });
        assert.strictEqual(back.status, 200);
    });

    await test('removing a friend', async () => {
        const r = await api(alice, 'POST', '/friends/remove', { uuid: BOB });
        assert.strictEqual(r.status, 200);
        const a = await api(alice, 'GET', '/friends');
        assert.ok(!a.body.friends.some((f) => f.name === 'Bob'));
        const msg = await api(bob, 'POST', `/friends/messages/${ALICE}`, { text: 'still there?' });
        assert.strictEqual(msg.status, 403);
    });

    await h.stop();
    if (failures) {
        console.error(`\n${failures} test(s) failed`);
        process.exit(1);
    }
    console.log('\nAll friend tests passed');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
