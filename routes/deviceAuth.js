const crypto = require('crypto');
const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const pool = require('../database');
const {
    ACCESS_TTL_SECONDS,
    REFRESH_TTL_DAYS,
    REFRESH_GRACE_MS,
    cloudError,
    clientIp,
    ensureCloudSettingsRow,
    ensureDeviceAuth,
    sha256,
    signAccessToken
} = require('../middleware/deviceAuth');

const router = express.Router();

const REDIRECT_SCHEME = 'luxclient://auth';

const AUTH_CODE_TTL_MS = 120 * 1000;

const PLATFORMS = new Set(['win32', 'darwin', 'linux']);

const CODE_CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;
const CODE_VERIFIER_RE = /^[A-Za-z0-9_-]{43,128}$/;
const STATE_RE = /^[A-Za-z0-9_-]{8,64}$/;
const DEVICE_UUID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const APP_VERSION_RE = /^[0-9A-Za-z.+-]{1,20}$/;

function base64Url(buffer) {
    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function cleanDeviceName(value) {
    if (typeof value !== 'string') return null;
    const cleaned = Array.from(value)
        .filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127)
        .join('')
        .trim()
        .slice(0, 100);
    return cleaned.length > 0 ? cleaned : null;
}

function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

function ensureSameOrigin(req, res, next) {
    const origin = req.get('origin');
    if (!origin) return next();

    let host;
    try {
        host = new URL(origin).host;
    } catch {
        return res.status(403).json({ error: 'forbidden', message: 'Invalid origin' });
    }

    const allowed = new Set([req.get('host')]);
    if (process.env.ALLOWED_ORIGINS) {
        for (const entry of process.env.ALLOWED_ORIGINS.split(',')) {
            try {
                allowed.add(new URL(entry.trim()).host);
            } catch {
            }
        }
    }

    if (!allowed.has(host)) {
        return res.status(403).json({ error: 'forbidden', message: 'Cross-origin request rejected' });
    }
    return next();
}

const tokenLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => cloudError(res, 429, 'rate_limited', 'Too many token requests', { retryAfter: 900 })
});

const refreshLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        const uuid = req.body && req.body.device_uuid;
        return DEVICE_UUID_RE.test(String(uuid || '')) ? `dev:${uuid}` : ipKeyGenerator(req.ip);
    },
    handler: (req, res) => cloudError(res, 429, 'rate_limited', 'Too many refresh requests', { retryAfter: 300 })
});

const approveLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: 'rate_limited', message: 'Too many authorization attempts' })
});

router.get('/auth/device', (req, res) => {
    const { code_challenge: codeChallenge, state } = req.query;

    if (!CODE_CHALLENGE_RE.test(String(codeChallenge || '')) || !STATE_RE.test(String(state || ''))) {
        return res.status(400).send('Invalid device authorization request.');
    }

    if (!req.isAuthenticated()) {
        return res.redirect(`/auth/google?returnTo=${encodeURIComponent(req.originalUrl)}`);
    }

    const params = new URLSearchParams({
        code_challenge: String(codeChallenge),
        state: String(state)
    });
    const deviceName = cleanDeviceName(req.query.device_name);
    if (deviceName) params.set('device_name', deviceName);
    if (PLATFORMS.has(String(req.query.platform))) params.set('platform', String(req.query.platform));

    return res.redirect(`/authorize-device?${params.toString()}`);
});

router.post('/auth/device/approve', approveLimiter, ensureSameOrigin, ensureAuthenticated, async (req, res) => {
    const { code_challenge: codeChallenge, state, device_name: deviceName, platform } = req.body || {};

    if (!CODE_CHALLENGE_RE.test(String(codeChallenge || ''))) {
        return res.status(400).json({ error: 'invalid_request', message: 'Invalid code challenge' });
    }
    if (!STATE_RE.test(String(state || ''))) {
        return res.status(400).json({ error: 'invalid_request', message: 'Invalid state' });
    }
    if (req.user.banned) {
        return res.status(403).json({ error: 'forbidden', message: 'Account is banned' });
    }

    try {
        const code = base64Url(crypto.randomBytes(32));
        const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_MS);

        await pool.query(
            `INSERT INTO device_auth_codes
                (code_hash, user_id, code_challenge, device_name, platform, expires_at)
             VALUES (?, ?, ?, ?, ?, ?)
             RETURNING code_hash`,
            [
                sha256(code),
                req.user.id,
                String(codeChallenge),
                cleanDeviceName(deviceName),
                PLATFORMS.has(String(platform)) ? String(platform) : null,
                expiresAt
            ]
        );

        // Fallback for machines where the luxclient:// handler never fires. The same
        // approval also gets a short code the user can type into Lux; it stays bound to
        // the same PKCE challenge, so the code alone is useless to anyone else.
        let manualCode = null;
        try {
            const { issueApprovedCode } = require('./devicePairing');
            manualCode = await issueApprovedCode({
                userId: req.user.id,
                codeChallenge: String(codeChallenge),
                deviceName: cleanDeviceName(deviceName),
                platform: PLATFORMS.has(String(platform)) ? String(platform) : 'win32'
            });
        } catch (err) {
            console.error('[LuxCloud] Could not issue a manual code:', err.message);
        }

        const redirectParams = new URLSearchParams({ code, state: String(state) });
        return res.json({
            redirectUrl: `${REDIRECT_SCHEME}?${redirectParams.toString()}`,
            manualCode,
            expiresIn: Math.floor(AUTH_CODE_TTL_MS / 1000)
        });
    } catch (err) {
        console.error('[LuxCloud] Device approval failed:', err);
        return res.status(500).json({ error: 'server_error', message: 'Could not authorize device' });
    }
});

router.post('/auth/device/deny', approveLimiter, ensureSameOrigin, ensureAuthenticated, (req, res) => {
    const { state } = req.body || {};
    if (!STATE_RE.test(String(state || ''))) {
        return res.status(400).json({ error: 'invalid_request', message: 'Invalid state' });
    }
    const params = new URLSearchParams({ error: 'access_denied', state: String(state) });
    return res.json({ redirectUrl: `${REDIRECT_SCHEME}?${params.toString()}` });
});

function issueRefreshToken() {
    const token = base64Url(crypto.randomBytes(32));
    return {
        token,
        hash: sha256(token),
        expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000)
    };
}

function tokenResponse({ user, deviceUuid, generation, refresh }) {
    return {
        accessToken: signAccessToken({ userId: user.id, deviceUuid, generation }),
        refreshToken: refresh.token,
        expiresIn: ACCESS_TTL_SECONDS,
        user: {
            id: user.id,
            username: user.username,
            avatar: user.avatar || null
        }
    };
}

router.post('/api/auth/device/token', tokenLimiter, async (req, res) => {
    const {
        code,
        code_verifier: codeVerifier,
        device_uuid: deviceUuid,
        device_name: deviceName,
        platform,
        app_version: appVersion
    } = req.body || {};

    if (typeof code !== 'string' || code.length === 0 || code.length > 128) {
        return cloudError(res, 400, 'invalid_grant', 'Missing authorization code');
    }
    if (!CODE_VERIFIER_RE.test(String(codeVerifier || ''))) {
        return cloudError(res, 400, 'invalid_grant', 'Invalid code verifier');
    }
    if (!DEVICE_UUID_RE.test(String(deviceUuid || ''))) {
        return cloudError(res, 400, 'invalid_request', 'Invalid device id');
    }
    if (!PLATFORMS.has(String(platform))) {
        return cloudError(res, 400, 'invalid_request', 'Unsupported platform');
    }
    if (appVersion && !APP_VERSION_RE.test(String(appVersion))) {
        return cloudError(res, 400, 'invalid_request', 'Invalid app version');
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [codeRows] = await connection.query(
            `SELECT user_id, code_challenge, device_name, platform
               FROM device_auth_codes
              WHERE code_hash = ?
                AND consumed_at IS NULL
                AND expires_at > NOW()`,
            [sha256(code)]
        );

        const row = codeRows[0];
        if (!row) {
            await connection.rollback();
            return cloudError(res, 400, 'invalid_grant', 'Authorization code is invalid or expired');
        }

        const [deviceRows] = await connection.query(
            'SELECT id, user_id, token_generation FROM client_devices WHERE device_uuid = ?',
            [String(deviceUuid)]
        );
        const existing = deviceRows[0];

        if (existing && Number(existing.user_id) !== Number(row.user_id)) {
            await connection.rollback();
            return cloudError(res, 409, 'device_conflict', 'This device id belongs to another account');
        }

        const [claim] = await connection.query(
            `UPDATE device_auth_codes
                SET consumed_at = NOW()
              WHERE code_hash = ?
                AND consumed_at IS NULL
              RETURNING code_hash`,
            [sha256(code)]
        );
        if (!claim || claim.affectedRows === 0) {
            await connection.rollback();
            return cloudError(res, 400, 'invalid_grant', 'Authorization code is invalid or expired');
        }

        const expectedChallenge = base64Url(crypto.createHash('sha256').update(String(codeVerifier)).digest());
        if (expectedChallenge !== row.code_challenge) {
            await connection.commit();
            return cloudError(res, 400, 'invalid_grant', 'PKCE verification failed');
        }

        const [userRows] = await connection.query(
            'SELECT id, username, avatar, banned FROM users WHERE id = ?',
            [row.user_id]
        );
        const user = userRows[0];
        if (!user) {
            await connection.rollback();
            return cloudError(res, 400, 'invalid_grant', 'Account no longer exists');
        }
        if (user.banned) {
            await connection.commit();
            return cloudError(res, 403, 'forbidden', 'Account is banned');
        }

        const refresh = issueRefreshToken();
        const resolvedName = cleanDeviceName(deviceName) || row.device_name || 'Lux Client';
        const ip = clientIp(req);
        let generation;

        if (existing) {
            generation = Number(existing.token_generation) + 1;
            await connection.query(
                `UPDATE client_devices
                    SET name = ?, platform = ?, app_version = ?,
                        refresh_token_hash = ?, refresh_expires_at = ?,
                        prev_refresh_token_hash = NULL, prev_refresh_valid_until = NULL,
                        token_generation = ?, revoked_at = NULL,
                        last_seen_at = NOW(), last_ip = ?
                  WHERE id = ?`,
                [resolvedName, String(platform), appVersion || null, refresh.hash, refresh.expiresAt,
                    generation, ip || null, existing.id]
            );
        } else {
            generation = 1;
            await connection.query(
                `INSERT INTO client_devices
                    (user_id, device_uuid, name, platform, app_version,
                     refresh_token_hash, refresh_expires_at, token_generation, last_seen_at, last_ip)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
                [user.id, String(deviceUuid), resolvedName, String(platform), appVersion || null,
                    refresh.hash, refresh.expiresAt, generation, ip || null]
            );
        }

        await ensureCloudSettingsRow(user.id, connection);
        await connection.commit();

        return res.json(tokenResponse({ user, deviceUuid: String(deviceUuid), generation, refresh }));
    } catch (err) {
        await connection.rollback().catch(() => {});
        console.error('[LuxCloud] Device token exchange failed:', err);
        return cloudError(res, 500, 'server_error', 'Token exchange failed');
    } finally {
        connection.release();
    }
});

async function invalidateDeviceChain(deviceId, userId) {
    await pool.query(
        `UPDATE client_devices
            SET refresh_token_hash = NULL,
                refresh_expires_at = NULL,
                prev_refresh_token_hash = NULL,
                prev_refresh_valid_until = NULL,
                token_generation = token_generation + 1,
                revoked_at = NOW()
          WHERE id = ?`,
        [deviceId]
    );

    try {
        await pool.query(
            'INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)',
            [userId, 'A Lux Client device was signed out automatically because an old session token was reused. If this was not you, please review your devices.', 'warning']
        );
    } catch (err) {
        console.error('[LuxCloud] Could not create reuse notification:', err.message);
    }
}

router.post('/api/auth/device/refresh', refreshLimiter, async (req, res) => {
    const { refresh_token: refreshToken, device_uuid: deviceUuid } = req.body || {};

    if (typeof refreshToken !== 'string' || refreshToken.length === 0 || refreshToken.length > 128) {
        return cloudError(res, 400, 'invalid_request', 'Missing refresh token');
    }
    if (!DEVICE_UUID_RE.test(String(deviceUuid || ''))) {
        return cloudError(res, 400, 'invalid_request', 'Invalid device id');
    }

    try {
        const [rows] = await pool.query(
            `SELECT d.id, d.user_id, d.token_generation, d.revoked_at,
                    d.refresh_token_hash, d.refresh_expires_at,
                    d.prev_refresh_token_hash, d.prev_refresh_valid_until,
                    u.username, u.avatar, u.banned
               FROM client_devices d
               JOIN users u ON u.id = d.user_id
              WHERE d.device_uuid = ?`,
            [String(deviceUuid)]
        );

        const device = rows[0];
        if (!device || device.revoked_at || !device.refresh_token_hash) {
            return cloudError(res, 401, 'device_revoked', 'This device is no longer authorized');
        }
        if (device.banned) {
            return cloudError(res, 403, 'forbidden', 'Account is banned');
        }
        if (device.refresh_expires_at && new Date(device.refresh_expires_at).getTime() < Date.now()) {
            return cloudError(res, 401, 'device_revoked', 'Refresh token expired');
        }

        const presented = sha256(refreshToken);
        const isCurrent = presented === device.refresh_token_hash;
        const isWithinGrace = Boolean(
            device.prev_refresh_token_hash &&
            presented === device.prev_refresh_token_hash &&
            device.prev_refresh_valid_until &&
            new Date(device.prev_refresh_valid_until).getTime() > Date.now()
        );

        if (!isCurrent && !isWithinGrace) {
            await invalidateDeviceChain(device.id, device.user_id);
            return cloudError(res, 401, 'device_revoked', 'Refresh token was already used');
        }

        const refresh = issueRefreshToken();
        const generation = Number(device.token_generation);

        await pool.query(
            `UPDATE client_devices
                SET refresh_token_hash = ?,
                    refresh_expires_at = ?,
                    prev_refresh_token_hash = ?,
                    prev_refresh_valid_until = ?,
                    last_seen_at = NOW(),
                    last_ip = ?
              WHERE id = ?`,
            [
                refresh.hash,
                refresh.expiresAt,
                device.refresh_token_hash,
                new Date(Date.now() + REFRESH_GRACE_MS),
                clientIp(req) || null,
                device.id
            ]
        );

        return res.json(tokenResponse({
            user: { id: device.user_id, username: device.username, avatar: device.avatar },
            deviceUuid: String(deviceUuid),
            generation,
            refresh
        }));
    } catch (err) {
        console.error('[LuxCloud] Refresh failed:', err);
        return cloudError(res, 500, 'server_error', 'Refresh failed');
    }
});

router.post('/api/auth/device/revoke', ensureDeviceAuth, async (req, res) => {
    try {
        await pool.query(
            `UPDATE client_devices
                SET revoked_at = NOW(),
                    refresh_token_hash = NULL,
                    refresh_expires_at = NULL,
                    prev_refresh_token_hash = NULL,
                    prev_refresh_valid_until = NULL,
                    token_generation = token_generation + 1
              WHERE id = ?`,
            [req.device.id]
        );
        return res.json({ ok: true });
    } catch (err) {
        console.error('[LuxCloud] Revoke failed:', err);
        return cloudError(res, 500, 'server_error', 'Could not revoke device');
    }
});

module.exports = router;
