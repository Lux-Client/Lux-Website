// Email + password accounts next to Google sign-in: registration with email confirmation,
// login with optional second factor (TOTP app, passkey or recovery code), passwordless
// passkey login, password reset, and the security settings behind /api/account.
//
// Every route answers JSON. Sessions are the same passport sessions Google uses, so the
// rest of the site (dashboard, cloud device authorization, ...) works unchanged.

const express = require('express');
const { rateLimit } = require('express-rate-limit');
const QRCode = require('qrcode');
const {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const c = require('../auth/crypto');

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const PENDING_2FA_TTL_MS = 10 * 60 * 1000;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_FAILED_LOGINS = 8;
const LOCK_MS = 15 * 60 * 1000;
const EMAIL_COOLDOWN_MS = 60 * 1000;

const USERNAME_RE = /^[A-Za-z0-9_.-]{3,32}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

function isSafeReturnPath(value) {
    if (typeof value !== 'string' || value.length === 0) return false;
    if (!value.startsWith('/')) return false;
    if (value.startsWith('//') || value.startsWith('/\\')) return false;
    return true;
}

function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function passwordProblem(password, { email, username } = {}) {
    const pw = String(password || '');
    if (pw.length < 8) return 'The password needs at least 8 characters.';
    if (pw.length > 200) return 'The password can have at most 200 characters.';
    const lower = pw.toLowerCase();
    if (email && lower === normalizeEmail(email)) return 'The password must not be your email address.';
    if (username && lower === String(username).toLowerCase()) return 'The password must not be your username.';
    if (/^(.)\1+$/.test(pw) || ['password', 'passwort', '12345678', '123456789', 'qwertzui', 'qwertyui'].includes(lower)) {
        return 'This password is too easy to guess.';
    }
    return null;
}

function emailUnavailableMessage(status) {
    if (status.reason === 'monthly') {
        return 'Due to a server problem, we cannot send emails right now. Please try again after the monthly email limit resets.';
    }
    if (status.reason === 'daily') {
        return 'Due to a server problem, we cannot send emails right now. Please try again tomorrow.';
    }
    return 'Due to a server problem, we cannot send emails right now. Please try again later.';
}

// Small in-memory cooldown per email address (on top of the per-IP limits).
function createCooldown(ms) {
    const seen = new Map();
    return {
        hit(key) {
            const now = Date.now();
            const last = seen.get(key);
            if (last && now - last < ms) return false;
            seen.set(key, now);
            if (seen.size > 5000) {
                for (const [k, t] of seen) if (now - t > ms) seen.delete(k);
            }
            return true;
        },
    };
}

function limiter(windowMs, limit, message, extra = {}) {
    return rateLimit({
        windowMs,
        limit,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => res.status(429).json({ error: message || 'Too many attempts. Please wait a moment and try again.', code: 'rate_limited' }),
        ...extra,
    });
}

function webauthnConfig() {
    const site = (process.env.SITE_URL || 'https://lux.pluginhub.de').replace(/\/+$/, '');
    let siteUrl;
    try { siteUrl = new URL(site); } catch { siteUrl = new URL('https://lux.pluginhub.de'); }
    const rpID = process.env.WEBAUTHN_RP_ID || siteUrl.hostname;
    const origins = (process.env.WEBAUTHN_ORIGINS || siteUrl.origin)
        .split(',').map((s) => s.trim()).filter(Boolean);
    if (process.env.NODE_ENV !== 'production') {
        origins.push('http://localhost:5173', 'http://localhost:3001', 'http://localhost:3000');
    }
    return { rpID, rpName: 'Lux Client', origins };
}

// limitScale only exists for tests (more attempts per window).
module.exports = function createAccountAuth({ pool, email, now = () => Date.now(), limitScale = 1 } = {}) {
    if (!pool) pool = require('../database');
    if (!email) email = require('../email');

    const router = express.Router();
    const emailCooldown = createCooldown(EMAIL_COOLDOWN_MS);
    const json = express.json({ limit: '64kb' });

    const loginLimiter = limiter(15 * 60 * 1000, 20 * limitScale, 'Too many sign-in attempts. Please wait 15 minutes.');
    const secondFactorLimiter = limiter(15 * 60 * 1000, 15 * limitScale, 'Too many codes tried. Please wait 15 minutes.');
    const registerLimiter = limiter(60 * 60 * 1000, 5 * limitScale, 'Too many accounts created from your network. Please try again later.');
    const mailLimiter = limiter(60 * 60 * 1000, 6 * limitScale, 'Too many emails requested. Please try again later.');
    const tokenLimiter = limiter(15 * 60 * 1000, 30 * limitScale);
    const accountLimiter = limiter(15 * 60 * 1000, 40 * limitScale);

    // ── helpers ─────────────────────────────────────────────────────────────

    async function userById(id) {
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
        return rows[0] || null;
    }

    async function userByEmail(address) {
        const [rows] = await pool.query('SELECT * FROM users WHERE LOWER(email) = ? ORDER BY id ASC', [normalizeEmail(address)]);
        // A password account wins over an older Google row with the same address.
        return rows.find((u) => u.password_hash) || rows[0] || null;
    }

    async function passkeysOf(userId) {
        const [rows] = await pool.query('SELECT * FROM auth_passkeys WHERE user_id = ? ORDER BY created_at ASC', [userId]);
        return rows;
    }

    async function recoveryCodesLeft(userId) {
        const [rows] = await pool.query('SELECT COUNT(*) AS n FROM auth_recovery_codes WHERE user_id = ? AND used_at IS NULL', [userId]);
        return Number(rows[0]?.n || 0);
    }

    // Returns an error message if the user may not sign in (banned), lifting expired bans.
    async function banProblem(user) {
        if (!user.banned) return null;
        if (user.ban_expires && new Date(user.ban_expires).getTime() < now()) {
            await pool.query('UPDATE users SET banned = FALSE, ban_reason = NULL, ban_expires = NULL WHERE id = ?', [user.id]);
            return null;
        }
        return user.ban_reason || 'You are banned from this platform.';
    }

    async function issueToken(userId, kind, ttlMs) {
        const token = c.randomToken();
        // Older unused links of the same kind stop working.
        await pool.query('UPDATE auth_tokens SET used_at = NOW() WHERE user_id = ? AND kind = ? AND used_at IS NULL', [userId, kind]);
        await pool.query(
            'INSERT INTO auth_tokens (user_id, kind, token_hash, expires_at) VALUES (?, ?, ?, ?)',
            [userId, kind, c.sha256(token), new Date(now() + ttlMs)]
        );
        return token;
    }

    async function findToken(token, kind) {
        if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
        const [rows] = await pool.query(
            'SELECT * FROM auth_tokens WHERE token_hash = ? AND kind = ? AND used_at IS NULL',
            [c.sha256(token), kind]
        );
        const row = rows[0];
        if (!row || new Date(row.expires_at).getTime() < now()) return null;
        return row;
    }

    async function consumeToken(row) {
        const [res] = await pool.query('UPDATE auth_tokens SET used_at = NOW() WHERE id = ? AND used_at IS NULL', [row.id]);
        return res.affectedRows === 1;
    }

    async function secondFactors(user) {
        const passkeys = await passkeysOf(user.id);
        const methods = [];
        if (user.totp_enabled) methods.push('totp');
        if (passkeys.length) methods.push('passkey');
        if (methods.length && (await recoveryCodesLeft(user.id)) > 0) methods.push('recovery');
        return methods;
    }

    function finishLogin(req, res, user, returnTo) {
        const target = isSafeReturnPath(returnTo) ? returnTo : '/dashboard';
        req.logIn(user, (err) => {
            if (err) {
                console.error('[Auth] Login failed:', err);
                return res.status(500).json({ error: 'Could not sign you in. Please try again.' });
            }
            pool.query('UPDATE users SET last_login = ?, failed_logins = 0, locked_until = NULL WHERE id = ?', [new Date(now()), user.id])
                .catch(() => {});
            req.session.save(() => res.json({ ok: true, returnTo: target }));
        });
    }

    // After the first step (password or Google), remember who is half signed in.
    function startSecondFactor(req, user, returnTo, methods) {
        req.session.pending2fa = {
            userId: user.id,
            expires: now() + PENDING_2FA_TTL_MS,
            returnTo: isSafeReturnPath(returnTo) ? returnTo : null,
            methods,
        };
    }

    async function pendingUser(req) {
        const pending = req.session && req.session.pending2fa;
        if (!pending || pending.expires < now()) return null;
        return userById(pending.userId);
    }

    async function checkTotp(user, code) {
        if (!user.totp_enabled || !user.totp_secret) return false;
        const secret = c.decrypt(user.totp_secret);
        if (!secret) return false;
        const step = c.verifyTotp(secret, code, { lastStep: user.totp_last_step, timeMs: now() });
        if (step === null) return false;
        // Only one use per code: the step is stored atomically.
        const [res] = await pool.query(
            'UPDATE users SET totp_last_step = ? WHERE id = ? AND (totp_last_step IS NULL OR totp_last_step < ?)',
            [step, user.id, step]
        );
        return res.affectedRows === 1;
    }

    async function useRecoveryCode(user, code) {
        const normalized = c.normalizeRecoveryCode(code);
        if (normalized.length !== 8) return false;
        const [res] = await pool.query(
            'UPDATE auth_recovery_codes SET used_at = NOW() WHERE user_id = ? AND code_hash = ? AND used_at IS NULL',
            [user.id, c.sha256(normalized)]
        );
        return res.affectedRows > 0;
    }

    async function storeRecoveryCodes(userId) {
        const codes = c.generateRecoveryCodes(10);
        await pool.query('DELETE FROM auth_recovery_codes WHERE user_id = ?', [userId]);
        for (const code of codes) {
            await pool.query('INSERT INTO auth_recovery_codes (user_id, code_hash) VALUES (?, ?)', [userId, c.sha256(c.normalizeRecoveryCode(code))]);
        }
        return codes;
    }

    // Sensitive changes ask again for the password (or, without one, a 2FA code).
    async function confirmIdentity(user, body) {
        if (user.password_hash) {
            if (!body.password) return 'Please enter your current password.';
            return (await c.verifyPassword(body.password, user.password_hash)) ? null : 'The current password is wrong.';
        }
        if (user.totp_enabled) {
            if (!body.code) return 'Please enter a code from your authenticator app.';
            return (await checkTotp(user, body.code)) ? null : 'That code is not valid.';
        }
        return null;
    }

    async function endOtherSessions(req, userId) {
        // Sessions live in user_sessions (connect-pg-simple). Keep the current one.
        try {
            await pool.query(
                "DELETE FROM user_sessions WHERE sid <> ? AND (sess::jsonb -> 'passport' ->> 'user') = ?",
                [req.sessionID || '', String(userId)]
            );
        } catch (err) {
            if (!/user_sessions/.test(err.message)) console.warn('[Auth] Could not end other sessions:', err.message);
        }
    }

    function requireUser(req, res, next) {
        if (req.isAuthenticated && req.isAuthenticated()) return next();
        res.status(401).json({ error: 'Please sign in first.' });
    }

    const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((err) => {
        console.error(`[Auth] ${req.method} ${req.originalUrl} failed:`, err);
        if (!res.headersSent) res.status(500).json({ error: 'Something went wrong. Please try again.' });
    });

    // Only JSON bodies: a plain HTML form from another site can't send those, which stops
    // cross-site form posts (login CSRF and the like).
    router.use(['/api/auth', '/api/account'], (req, res, next) => {
        if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
        if (req.headers['content-length'] === '0' || req.headers['content-length'] === undefined && !req.headers['transfer-encoding']) {
            // Bodyless requests (cancel, setup) still must not come from a form.
            if (req.is('application/x-www-form-urlencoded') || req.is('multipart/form-data') || req.is('text/plain')) {
                return res.status(415).json({ error: 'Unsupported request.' });
            }
            return next();
        }
        if (!req.is('application/json')) return res.status(415).json({ error: 'Unsupported request.' });
        next();
    });

    // ── public config ───────────────────────────────────────────────────────

    router.get('/api/auth/config', ah(async (req, res) => {
        const status = await email.getStatus();
        res.set('Cache-Control', 'no-store');
        res.json({
            google: Boolean(process.env.GOOGLE_CLIENT_ID),
            registrationOpen: status.available,
            emailAvailable: status.available,
            emailReason: status.reason,
            emailResumesAt: status.resumesAt,
            pending2fa: req.session && req.session.pending2fa && req.session.pending2fa.expires > now()
                ? { methods: req.session.pending2fa.methods || [] }
                : null,
        });
    }));

    // ── registration ────────────────────────────────────────────────────────

    router.post('/api/auth/register', json, registerLimiter, ah(async (req, res) => {
        const username = String(req.body?.username || '').trim();
        const address = normalizeEmail(req.body?.email);
        const password = String(req.body?.password || '');

        if (!USERNAME_RE.test(username)) {
            return res.status(400).json({ error: 'Usernames have 3 to 32 characters: letters, digits, _ . and -.', field: 'username' });
        }
        if (!EMAIL_RE.test(address) || address.length > 100) {
            return res.status(400).json({ error: 'Please enter a valid email address.', field: 'email' });
        }
        const pwProblem = passwordProblem(password, { email: address, username });
        if (pwProblem) return res.status(400).json({ error: pwProblem, field: 'password' });

        // No emails, no new accounts: they could never be confirmed.
        const status = await email.getStatus();
        if (!status.available) {
            return res.status(503).json({
                error: 'Registration is closed for now because we cannot send emails. You can still sign in with Google.',
                code: 'email_unavailable', reason: status.reason, resumesAt: status.resumesAt,
            });
        }

        const existing = await userByEmail(address);
        if (existing) {
            // Don't reveal that the address has an account; tell the owner instead.
            if (emailCooldown.hit(`exists:${address}`)) {
                await email.sendAlreadyRegisteredEmail({ to: existing.email, username: existing.username });
            }
            return res.json({ ok: true, verificationSent: true });
        }

        const [taken] = await pool.query('SELECT id FROM users WHERE LOWER(username) = ?', [username.toLowerCase()]);
        if (taken.length) return res.status(409).json({ error: 'This username is already taken.', field: 'username' });

        const hash = await c.hashPassword(password);
        let userId;
        try {
            const [result] = await pool.query(
                'INSERT INTO users (username, email, password_hash, email_verified, bio, role, password_changed_at) VALUES (?, ?, ?, FALSE, ?, ?, ?)',
                [username, address, hash, 'Project Lux Client Member', 'user', new Date(now())]
            );
            userId = result.insertId;
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'This username is already taken.', field: 'username' });
            throw err;
        }

        const token = await issueToken(userId, 'verify', VERIFY_TTL_MS);
        emailCooldown.hit(`verify:${address}`);
        const sent = await email.sendVerificationEmail({ to: address, username, token });
        if (!sent.sent) {
            // Without the email the account is useless; remove it so the name stays free.
            await pool.query('DELETE FROM users WHERE id = ?', [userId]);
            const after = await email.getStatus();
            return res.status(503).json({
                error: after.available
                    ? 'We could not send the confirmation email. Please try again in a moment.'
                    : 'Registration is closed for now because we cannot send emails. You can still sign in with Google.',
                code: 'email_unavailable', reason: after.reason, resumesAt: after.resumesAt,
            });
        }
        console.log(`[Auth] New email account ${userId} (${username}), confirmation sent.`);
        res.json({ ok: true, verificationSent: true });
    }));

    router.post('/api/auth/verify-email', json, tokenLimiter, ah(async (req, res) => {
        const row = await findToken(req.body?.token, 'verify');
        if (!row) return res.status(400).json({ error: 'This confirmation link is invalid or has expired.', code: 'invalid_token' });
        if (!(await consumeToken(row))) return res.status(400).json({ error: 'This confirmation link was already used.', code: 'invalid_token' });
        await pool.query('UPDATE users SET email_verified = TRUE WHERE id = ?', [row.user_id]);
        const user = await userById(row.user_id);
        if (!user) return res.status(400).json({ error: 'This account no longer exists.' });
        const banned = await banProblem(user);
        if (banned) return res.status(403).json({ error: banned, code: 'banned' });
        const methods = await secondFactors(user);
        if (methods.length) {
            startSecondFactor(req, user, null, methods);
            return req.session.save(() => res.json({ ok: true, verified: true, twoFactor: true, methods }));
        }
        finishLogin(req, res, user, '/dashboard');
    }));

    router.post('/api/auth/resend-verification', json, mailLimiter, ah(async (req, res) => {
        const address = normalizeEmail(req.body?.email);
        if (!EMAIL_RE.test(address)) return res.status(400).json({ error: 'Please enter a valid email address.' });
        const status = await email.getStatus();
        if (!status.available) {
            return res.status(503).json({ error: emailUnavailableMessage(status), code: 'email_unavailable', reason: status.reason, resumesAt: status.resumesAt });
        }
        const user = await userByEmail(address);
        if (user && user.password_hash && !user.email_verified && emailCooldown.hit(`verify:${address}`)) {
            const token = await issueToken(user.id, 'verify', VERIFY_TTL_MS);
            const sent = await email.sendVerificationEmail({ to: user.email, username: user.username, token });
            if (!sent.sent) {
                const after = await email.getStatus();
                return res.status(503).json({ error: emailUnavailableMessage(after), code: 'email_unavailable', reason: after.reason, resumesAt: after.resumesAt });
            }
        }
        res.json({ ok: true });
    }));

    // ── login ───────────────────────────────────────────────────────────────

    router.post('/api/auth/login', json, loginLimiter, ah(async (req, res) => {
        const address = normalizeEmail(req.body?.email);
        const password = String(req.body?.password || '');
        const returnTo = req.body?.returnTo;
        const invalid = () => res.status(401).json({ error: 'Email or password is wrong.', code: 'invalid_credentials' });

        if (!address || !password || password.length > 200) return invalid();
        const user = await userByEmail(address);
        if (!user || !user.password_hash) {
            await c.burnPasswordCheck(password);
            return invalid();
        }
        if (user.locked_until && new Date(user.locked_until).getTime() > now()) {
            return res.status(429).json({ error: 'Too many wrong passwords. This account is locked for a few minutes.', code: 'locked' });
        }
        if (!(await c.verifyPassword(password, user.password_hash))) {
            const failed = Number(user.failed_logins || 0) + 1;
            if (failed >= MAX_FAILED_LOGINS) {
                await pool.query('UPDATE users SET failed_logins = 0, locked_until = ? WHERE id = ?', [new Date(now() + LOCK_MS), user.id]);
            } else {
                await pool.query('UPDATE users SET failed_logins = ? WHERE id = ?', [failed, user.id]);
            }
            return invalid();
        }
        if (!user.email_verified) {
            return res.status(403).json({ error: 'Please confirm your email address first. Check your inbox.', code: 'email_unverified' });
        }
        const banned = await banProblem(user);
        if (banned) return res.status(403).json({ error: banned, code: 'banned' });

        await pool.query('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?', [user.id]);
        const methods = await secondFactors(user);
        if (methods.length) {
            startSecondFactor(req, user, returnTo, methods);
            return req.session.save(() => res.json({ ok: true, twoFactor: true, methods }));
        }
        finishLogin(req, res, user, returnTo);
    }));

    router.post('/api/auth/login/2fa', json, secondFactorLimiter, ah(async (req, res) => {
        const user = await pendingUser(req);
        if (!user) return res.status(401).json({ error: 'Your sign-in expired. Please start again.', code: 'no_pending_login' });
        const pending = req.session.pending2fa;
        pending.attempts = (pending.attempts || 0) + 1;
        if (pending.attempts > 6) {
            delete req.session.pending2fa;
            return req.session.save(() => res.status(429).json({ error: 'Too many wrong codes. Please sign in again.', code: 'no_pending_login' }));
        }
        let ok = false;
        if (req.body?.recoveryCode) ok = await useRecoveryCode(user, req.body.recoveryCode);
        else if (req.body?.code) ok = await checkTotp(user, req.body.code);
        if (!ok) return req.session.save(() => res.status(401).json({ error: 'That code is not valid.', code: 'invalid_code' }));
        const banned = await banProblem(user);
        if (banned) return res.status(403).json({ error: banned, code: 'banned' });
        const returnTo = pending.returnTo;
        delete req.session.pending2fa;
        finishLogin(req, res, user, returnTo);
    }));

    router.post('/api/auth/login/cancel', (req, res) => {
        if (req.session) delete req.session.pending2fa;
        res.json({ ok: true });
    });

    // ── passkey login (passwordless, or as the second step) ─────────────────

    router.post('/api/auth/passkey/options', json, loginLimiter, ah(async (req, res) => {
        const cfg = webauthnConfig();
        const user = await pendingUser(req);
        const allowCredentials = user
            ? (await passkeysOf(user.id)).map((p) => ({ id: p.credential_id, transports: p.transports ? p.transports.split(',') : undefined }))
            : [];
        const options = await generateAuthenticationOptions({
            rpID: cfg.rpID,
            allowCredentials,
            userVerification: 'preferred',
            timeout: 60000,
        });
        req.session.passkeyLogin = { challenge: options.challenge, expires: now() + CHALLENGE_TTL_MS, returnTo: req.body?.returnTo };
        req.session.save(() => res.json(options));
    }));

    router.post('/api/auth/passkey/verify', json, loginLimiter, ah(async (req, res) => {
        const cfg = webauthnConfig();
        const state = req.session && req.session.passkeyLogin;
        if (req.session) delete req.session.passkeyLogin;
        const response = req.body?.response;
        if (!state || state.expires < now() || !response || typeof response.id !== 'string') {
            return res.status(400).json({ error: 'The passkey request expired. Please try again.' });
        }
        const [rows] = await pool.query('SELECT * FROM auth_passkeys WHERE credential_id = ?', [response.id]);
        const passkey = rows[0];
        if (!passkey) return res.status(401).json({ error: 'This passkey is not linked to any Lux account.' });

        const pending = await pendingUser(req);
        if (pending && pending.id !== passkey.user_id) {
            return res.status(401).json({ error: 'This passkey belongs to a different account.' });
        }

        let verification;
        try {
            verification = await verifyAuthenticationResponse({
                response,
                expectedChallenge: state.challenge,
                expectedOrigin: cfg.origins,
                expectedRPID: cfg.rpID,
                credential: {
                    id: passkey.credential_id,
                    publicKey: Buffer.from(passkey.public_key, 'base64url'),
                    counter: Number(passkey.counter || 0),
                    transports: passkey.transports ? passkey.transports.split(',') : undefined,
                },
                requireUserVerification: false,
            });
        } catch (err) {
            return res.status(401).json({ error: 'The passkey could not be verified.' });
        }
        if (!verification.verified) return res.status(401).json({ error: 'The passkey could not be verified.' });

        await pool.query('UPDATE auth_passkeys SET counter = ?, last_used_at = NOW() WHERE id = ?',
            [verification.authenticationInfo.newCounter, passkey.id]);

        const user = await userById(passkey.user_id);
        if (!user) return res.status(401).json({ error: 'This account no longer exists.' });
        if (user.password_hash && !user.email_verified) {
            return res.status(403).json({ error: 'Please confirm your email address first.', code: 'email_unverified' });
        }
        const banned = await banProblem(user);
        if (banned) return res.status(403).json({ error: banned, code: 'banned' });
        const returnTo = (req.session.pending2fa && req.session.pending2fa.returnTo) || state.returnTo;
        delete req.session.pending2fa;
        finishLogin(req, res, user, returnTo);
    }));

    // ── password reset ──────────────────────────────────────────────────────

    router.post('/api/auth/forgot-password', json, mailLimiter, ah(async (req, res) => {
        const address = normalizeEmail(req.body?.email);
        if (!EMAIL_RE.test(address)) return res.status(400).json({ error: 'Please enter a valid email address.' });

        const status = await email.getStatus();
        if (!status.available) {
            return res.status(503).json({ error: emailUnavailableMessage(status), code: 'email_unavailable', reason: status.reason, resumesAt: status.resumesAt });
        }
        const user = await userByEmail(address);
        // Same answer whether or not the address has an account.
        if (user && emailCooldown.hit(`reset:${address}`)) {
            const banned = user.banned && !(user.ban_expires && new Date(user.ban_expires).getTime() < now());
            if (!banned) {
                const token = await issueToken(user.id, 'reset', RESET_TTL_MS);
                const sent = await email.sendPasswordResetEmail({ to: user.email, username: user.username, token });
                if (!sent.sent) {
                    const after = await email.getStatus();
                    return res.status(503).json({ error: emailUnavailableMessage(after), code: 'email_unavailable', reason: after.reason, resumesAt: after.resumesAt });
                }
            }
        }
        res.json({ ok: true });
    }));

    router.get('/api/auth/reset-password/check', tokenLimiter, ah(async (req, res) => {
        const row = await findToken(req.query.token, 'reset');
        res.json({ valid: Boolean(row) });
    }));

    router.post('/api/auth/reset-password', json, tokenLimiter, ah(async (req, res) => {
        const row = await findToken(req.body?.token, 'reset');
        if (!row) return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.', code: 'invalid_token' });
        const user = await userById(row.user_id);
        if (!user) return res.status(400).json({ error: 'This account no longer exists.' });
        const problem = passwordProblem(req.body?.password, { email: user.email, username: user.username });
        if (problem) return res.status(400).json({ error: problem, field: 'password' });
        if (!(await consumeToken(row))) return res.status(400).json({ error: 'This reset link was already used.', code: 'invalid_token' });

        const hash = await c.hashPassword(req.body.password);
        // The link proved the address, so it counts as confirmed.
        await pool.query(
            'UPDATE users SET password_hash = ?, email_verified = TRUE, failed_logins = 0, locked_until = NULL, password_changed_at = ? WHERE id = ?',
            [hash, new Date(now()), user.id]
        );
        await endOtherSessions({ sessionID: '' }, user.id);
        console.log(`[Auth] Password reset for user ${user.id}.`);
        res.json({ ok: true });
    }));

    // ── account security settings ───────────────────────────────────────────

    router.get('/api/account/security', requireUser, ah(async (req, res) => {
        const user = await userById(req.user.id);
        const passkeys = await passkeysOf(user.id);
        res.set('Cache-Control', 'no-store');
        res.json({
            email: user.email,
            emailVerified: Boolean(user.email_verified),
            hasPassword: Boolean(user.password_hash),
            google: Boolean(user.google_id),
            totpEnabled: Boolean(user.totp_enabled),
            recoveryCodesLeft: user.totp_enabled || passkeys.length ? await recoveryCodesLeft(user.id) : 0,
            passwordChangedAt: user.password_changed_at || null,
            passkeys: passkeys.map((p) => ({ id: p.id, name: p.name, createdAt: p.created_at, lastUsedAt: p.last_used_at })),
        });
    }));

    router.post('/api/account/password', json, requireUser, accountLimiter, ah(async (req, res) => {
        const user = await userById(req.user.id);
        const newPassword = String(req.body?.newPassword || '');
        if (user.password_hash) {
            if (!(await c.verifyPassword(String(req.body?.currentPassword || ''), user.password_hash))) {
                return res.status(400).json({ error: 'The current password is wrong.', field: 'currentPassword' });
            }
        } else {
            // Google account adding a password: needs an address to sign in with.
            if (!user.email) return res.status(400).json({ error: 'Your account has no email address to sign in with.' });
            if (user.totp_enabled && !(await checkTotp(user, req.body?.code))) {
                return res.status(400).json({ error: 'Please enter a valid code from your authenticator app.', field: 'code' });
            }
        }
        const problem = passwordProblem(newPassword, { email: user.email, username: user.username });
        if (problem) return res.status(400).json({ error: problem, field: 'newPassword' });

        const hash = await c.hashPassword(newPassword);
        await pool.query('UPDATE users SET password_hash = ?, email_verified = TRUE, password_changed_at = ? WHERE id = ?',
            [hash, new Date(now()), user.id]);
        await endOtherSessions(req, user.id);
        if (user.password_hash) {
            email.sendSecurityNotice({ to: user.email, username: user.username, what: 'your password was changed' }).catch(() => {});
        }
        res.json({ ok: true });
    }));

    router.post('/api/account/totp/setup', json, requireUser, accountLimiter, ah(async (req, res) => {
        const user = await userById(req.user.id);
        if (user.totp_enabled) return res.status(400).json({ error: 'Two-factor authentication is already on.' });
        const secret = c.generateTotpSecret();
        req.session.totpSetup = { secret: c.encrypt(secret), expires: now() + 15 * 60 * 1000 };
        const uri = c.totpUri({ secret, account: user.email || user.username });
        const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
        req.session.save(() => res.json({ secret, uri, qr }));
    }));

    router.post('/api/account/totp/enable', json, requireUser, accountLimiter, ah(async (req, res) => {
        const setup = req.session.totpSetup;
        if (!setup || setup.expires < now()) return res.status(400).json({ error: 'The setup expired. Please start again.' });
        const secret = c.decrypt(setup.secret);
        const step = secret ? c.verifyTotp(secret, req.body?.code, { timeMs: now() }) : null;
        if (step === null) return res.status(400).json({ error: 'That code is not valid. Check the time on your phone and try again.', field: 'code' });
        await pool.query('UPDATE users SET totp_secret = ?, totp_enabled = TRUE, totp_last_step = ? WHERE id = ?',
            [c.encrypt(secret), step, req.user.id]);
        delete req.session.totpSetup;
        const codes = await storeRecoveryCodes(req.user.id);
        const user = await userById(req.user.id);
        email.sendSecurityNotice({ to: user.email, username: user.username, what: 'two-factor authentication was turned on' }).catch(() => {});
        req.session.save(() => res.json({ ok: true, recoveryCodes: codes }));
    }));

    router.post('/api/account/totp/disable', json, requireUser, accountLimiter, ah(async (req, res) => {
        const user = await userById(req.user.id);
        if (!user.totp_enabled) return res.json({ ok: true });
        const problem = await confirmIdentity(user, req.body || {});
        if (problem) return res.status(400).json({ error: problem });
        await pool.query('UPDATE users SET totp_secret = NULL, totp_enabled = FALSE, totp_last_step = NULL WHERE id = ?', [user.id]);
        if (!(await passkeysOf(user.id)).length) await pool.query('DELETE FROM auth_recovery_codes WHERE user_id = ?', [user.id]);
        email.sendSecurityNotice({ to: user.email, username: user.username, what: 'two-factor authentication was turned off' }).catch(() => {});
        res.json({ ok: true });
    }));

    router.post('/api/account/recovery-codes', json, requireUser, accountLimiter, ah(async (req, res) => {
        const user = await userById(req.user.id);
        if (!user.totp_enabled && !(await passkeysOf(user.id)).length) {
            return res.status(400).json({ error: 'Turn on two-factor authentication or add a passkey first.' });
        }
        const problem = await confirmIdentity(user, req.body || {});
        if (problem) return res.status(400).json({ error: problem });
        res.json({ ok: true, recoveryCodes: await storeRecoveryCodes(user.id) });
    }));

    router.post('/api/account/passkeys/options', json, requireUser, accountLimiter, ah(async (req, res) => {
        const cfg = webauthnConfig();
        const user = await userById(req.user.id);
        const existing = await passkeysOf(user.id);
        if (existing.length >= 10) return res.status(400).json({ error: 'You can have at most 10 passkeys.' });
        const options = await generateRegistrationOptions({
            rpName: cfg.rpName,
            rpID: cfg.rpID,
            userID: new TextEncoder().encode(`lux-user-${user.id}`),
            userName: user.email || user.username,
            userDisplayName: user.username,
            attestationType: 'none',
            excludeCredentials: existing.map((p) => ({ id: p.credential_id, transports: p.transports ? p.transports.split(',') : undefined })),
            authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
            timeout: 60000,
        });
        req.session.passkeyRegister = { challenge: options.challenge, expires: now() + CHALLENGE_TTL_MS };
        req.session.save(() => res.json(options));
    }));

    router.post('/api/account/passkeys/verify', json, requireUser, accountLimiter, ah(async (req, res) => {
        const cfg = webauthnConfig();
        const state = req.session.passkeyRegister;
        delete req.session.passkeyRegister;
        if (!state || state.expires < now() || !req.body?.response) {
            return res.status(400).json({ error: 'The passkey request expired. Please try again.' });
        }
        let verification;
        try {
            verification = await verifyRegistrationResponse({
                response: req.body.response,
                expectedChallenge: state.challenge,
                expectedOrigin: cfg.origins,
                expectedRPID: cfg.rpID,
                requireUserVerification: false,
            });
        } catch (err) {
            return res.status(400).json({ error: 'The passkey could not be verified.' });
        }
        if (!verification.verified || !verification.registrationInfo) {
            return res.status(400).json({ error: 'The passkey could not be verified.' });
        }
        const { credential } = verification.registrationInfo;
        const name = String(req.body?.name || '').trim().slice(0, 60) || 'Passkey';
        try {
            await pool.query(
                'INSERT INTO auth_passkeys (user_id, credential_id, public_key, counter, transports, name) VALUES (?, ?, ?, ?, ?, ?)',
                [req.user.id, credential.id, Buffer.from(credential.publicKey).toString('base64url'), credential.counter || 0,
                    (credential.transports || req.body.response?.response?.transports || []).join(',') || null, name]
            );
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'This passkey is already added.' });
            throw err;
        }
        const user = await userById(req.user.id);
        email.sendSecurityNotice({ to: user.email, username: user.username, what: `a passkey ("${name}") was added` }).catch(() => {});
        // First second factor without TOTP: hand out recovery codes too.
        let recoveryCodes = null;
        if (!user.totp_enabled && (await recoveryCodesLeft(user.id)) === 0) recoveryCodes = await storeRecoveryCodes(user.id);
        req.session.save(() => res.json({ ok: true, recoveryCodes }));
    }));

    router.patch('/api/account/passkeys/:id', json, requireUser, accountLimiter, ah(async (req, res) => {
        const name = String(req.body?.name || '').trim().slice(0, 60);
        if (!name) return res.status(400).json({ error: 'Please enter a name.' });
        const [r] = await pool.query('UPDATE auth_passkeys SET name = ? WHERE id = ? AND user_id = ?', [name, Number(req.params.id), req.user.id]);
        if (!r.affectedRows) return res.status(404).json({ error: 'Passkey not found.' });
        res.json({ ok: true });
    }));

    router.delete('/api/account/passkeys/:id', json, requireUser, accountLimiter, ah(async (req, res) => {
        const user = await userById(req.user.id);
        const keys = await passkeysOf(user.id);
        const target = keys.find((p) => p.id === Number(req.params.id));
        if (!target) return res.status(404).json({ error: 'Passkey not found.' });
        // Never remove the last way to sign in.
        if (keys.length === 1 && !user.password_hash && !user.google_id) {
            return res.status(400).json({ error: 'This is your only way to sign in. Set a password first.' });
        }
        await pool.query('DELETE FROM auth_passkeys WHERE id = ? AND user_id = ?', [target.id, user.id]);
        if (keys.length === 1 && !user.totp_enabled) await pool.query('DELETE FROM auth_recovery_codes WHERE user_id = ?', [user.id]);
        email.sendSecurityNotice({ to: user.email, username: user.username, what: `a passkey ("${target.name}") was removed` }).catch(() => {});
        res.json({ ok: true });
    }));

    // Used by the Google callback: does this user still need a second step?
    router.secondFactors = secondFactors;
    router.startSecondFactor = startSecondFactor;
    return router;
};

module.exports.isSafeReturnPath = isSafeReturnPath;
module.exports.passwordProblem = passwordProblem;
