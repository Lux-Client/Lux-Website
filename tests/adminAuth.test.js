/* Covers the three holes the admin master password used to have:
   guessable at full speed, accepted from the query string, and compared
   with === . Run with: node tests/adminAuth.test.js */

const assert = require('assert');
const http = require('http');
const express = require('express');
const session = require('express-session');

const createAdminAuth = require('../middleware/adminAuth');
const { passwordMatches, readPassword } = require('../middleware/adminAuth');

const PASSWORD = 'correct-horse-battery-staple';
let failures = 0;

function check(name, fn) {
    try {
        fn();
        console.log(`  ok   ${name}`);
    } catch (err) {
        failures++;
        console.error(`  FAIL ${name}\n       ${err.message}`);
    }
}

async function checkAsync(name, fn) {
    try {
        await fn();
        console.log(`  ok   ${name}`);
    } catch (err) {
        failures++;
        console.error(`  FAIL ${name}\n       ${err.message}`);
    }
}

// ── unit: comparison and where the password may come from ───────────────────

console.log('passwordMatches');
check('accepts the exact password', () => assert.strictEqual(passwordMatches(PASSWORD, PASSWORD), true));
check('rejects a wrong password of equal length', () => {
    const firstCharDiffers = 'Xorrect-horse-battery-staple';
    const lastCharDiffers  = 'correct-horse-battery-staplX';
    assert.strictEqual(firstCharDiffers.length, PASSWORD.length);
    assert.strictEqual(lastCharDiffers.length, PASSWORD.length);
    assert.strictEqual(passwordMatches(firstCharDiffers, PASSWORD), false);
    assert.strictEqual(passwordMatches(lastCharDiffers, PASSWORD), false);
});
check('rejects a prefix', () => assert.strictEqual(passwordMatches('correct-horse', PASSWORD), false));
check('rejects empty and non-strings', () => {
    assert.strictEqual(passwordMatches('', PASSWORD), false);
    assert.strictEqual(passwordMatches(undefined, PASSWORD), false);
    assert.strictEqual(passwordMatches(null, PASSWORD), false);
    assert.strictEqual(passwordMatches({}, PASSWORD), false);
});
check('rejects everything when no password is configured', () => {
    assert.strictEqual(passwordMatches('anything', ''), false);
    assert.strictEqual(passwordMatches('', ''), false);
});

console.log('readPassword');
check('reads the X-Admin-Password header', () => {
    const req = { get: h => (h === 'x-admin-password' ? 'from-header' : undefined), body: {} };
    assert.strictEqual(readPassword(req), 'from-header');
});
check('reads the body', () => {
    const req = { get: () => undefined, body: { password: 'from-body' } };
    assert.strictEqual(readPassword(req), 'from-body');
});
check('never reads the query string', () => {
    const req = { get: () => undefined, body: {}, query: { password: PASSWORD } };
    assert.strictEqual(readPassword(req), null);
});

// ── integration: a real express app behind the middleware ───────────────────

function buildApp() {
    const adminAuth = createAdminAuth(PASSWORD);
    const app = express();
    app.set('trust proxy', 1);
    app.use(express.json());
    app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: false }));
    // No passport in this harness, so isAuthenticated is always absent.
    app.post('/api/login', adminAuth.adminAuthLimiter, (req, res) => {
        if (adminAuth.submitsPassword(req)) {
            adminAuth.unlock(req);
            return res.json({ success: true });
        }
        return res.status(401).json({ success: false });
    });
    app.get('/api/protected', adminAuth.adminAuthLimiter, adminAuth.adminOrPassword, (req, res) =>
        res.json({ secret: 'ok' }));
    app.post('/api/admin/lock', (req, res) => {
        req.session.adminBypass = false;
        res.json({ success: true });
    });
    return app;
}

function request(server, { method = 'GET', path = '/', body, headers = {}, cookie }) {
    return new Promise((resolve, reject) => {
        const payload = body === undefined ? null : JSON.stringify(body);
        const req = http.request({
            host: '127.0.0.1',
            port: server.address().port,
            method,
            path,
            headers: {
                ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
                ...(cookie ? { Cookie: cookie } : {}),
                ...headers,
            },
        }, res => {
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end', () => resolve({
                status: res.statusCode,
                body: data,
                cookie: (res.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; '),
            }));
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

(async () => {
    const server = http.createServer(buildApp()).listen(0);
    await new Promise(r => server.once('listening', r));

    console.log('endpoints');

    await checkAsync('a wrong password is rejected', async () => {
        const res = await request(server, { method: 'POST', path: '/api/login', body: { password: 'wrong' } });
        assert.strictEqual(res.status, 401);
    });

    await checkAsync('the password in a query string does NOT authorise', async () => {
        const res = await request(server, { path: `/api/protected?password=${encodeURIComponent(PASSWORD)}` });
        assert.strictEqual(res.status, 401, 'query string must not be accepted');
    });

    await checkAsync('the header authorises', async () => {
        const res = await request(server, { path: '/api/protected', headers: { 'X-Admin-Password': PASSWORD } });
        assert.strictEqual(res.status, 200);
    });

    let sessionCookie = null;
    await checkAsync('unlocking once lets later requests through with no password', async () => {
        const login = await request(server, { method: 'POST', path: '/api/login', body: { password: PASSWORD } });
        assert.strictEqual(login.status, 200);
        assert.ok(login.cookie, 'expected a session cookie');
        sessionCookie = login.cookie;

        const res = await request(server, { path: '/api/protected', cookie: sessionCookie });
        assert.strictEqual(res.status, 200, 'unlocked session should be enough');
    });

    await checkAsync('locking again revokes access', async () => {
        await request(server, { method: 'POST', path: '/api/admin/lock', cookie: sessionCookie });
        const res = await request(server, { path: '/api/protected', cookie: sessionCookie });
        assert.strictEqual(res.status, 401);
    });

    await checkAsync('repeated guessing is cut off by the rate limit', async () => {
        let sawLimit = false;
        let attempts = 0;
        for (let i = 0; i < 40; i++) {
            attempts++;
            const res = await request(server, { method: 'POST', path: '/api/login', body: { password: `guess-${i}` } });
            if (res.status === 429) { sawLimit = true; break; }
            assert.strictEqual(res.status, 401);
        }
        assert.ok(sawLimit, `expected a 429 within 40 guesses, got none`);
        assert.ok(attempts <= 15, `expected the cut-off well under 15 guesses, took ${attempts}`);
    });

    await checkAsync('a blocked IP stays blocked even with the correct password', async () => {
        // skipSuccessfulRequests means the earlier failures still block, which is
        // the point: the limiter must not be bypassable by simply guessing right.
        const res = await request(server, { method: 'POST', path: '/api/login', body: { password: PASSWORD } });
        assert.strictEqual(res.status, 429, 'blocked IP stays blocked for the window');
    });

    server.close();

    console.log(failures === 0 ? '\nall admin auth checks passed' : `\n${failures} check(s) failed`);
    process.exit(failures === 0 ? 0 : 1);
})();
