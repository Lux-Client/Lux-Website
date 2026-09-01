const express = require('express');
const crypto = require('crypto');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const pool = require('../database');
const { sha256, signAccessToken, REFRESH_TTL_DAYS, ACCESS_TTL_SECONDS } = require('../middleware/deviceAuth');

const router = express.Router();

// Ambiguous glyphs are left out so a code read off a screen and typed on a phone
// cannot turn into a different one: no 0/O, no 1/I/L.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const USER_CODE_LENGTH = 6;
const USER_CODE_RE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;
const CODE_CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;

const PAIRING_TTL_MS = Number(process.env.LUXCLOUD_PAIRING_TTL_MS || 10 * 60 * 1000);
const POLL_INTERVAL_SECONDS = 3;
const MAX_POLLS = 400;
const PLATFORMS = new Set(['win32', 'darwin', 'linux']);

const startLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: ipKeyGenerator,
    handler: (req, res) => res.status(429).json({
        error: 'rate_limited', message: 'Too many pairing requests', retryAfter: 900
    })
});

// The real brute-force surface: guessing a pending user code and getting a victim
// to approve someone else's client. Short window plus a tight limit.
const lookupLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `pair-lookup-${req.user ? req.user.id : ipKeyGenerator(req)}`,
    handler: (req, res) => res.status(429).json({
        error: 'rate_limited', message: 'Too many code attempts', retryAfter: 600
    })
});

const pollLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: ipKeyGenerator,
    handler: (req, res) => res.status(429).json({
        error: 'slow_down', message: 'Polling too fast', retryAfter: 5
    })
});

function newUserCode() {
    const bytes = crypto.randomBytes(USER_CODE_LENGTH);
    let out = '';
    for (let i = 0; i < USER_CODE_LENGTH; i += 1) {
        out += ALPHABET[bytes[i] % ALPHABET.length];
    }
    return out;
}

function cleanDeviceName(value) {
    if (typeof value !== 'string') return null;
    const cleaned = Array.from(value)
        .filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127)
        .join('')
        .trim()
        .slice(0, 60);
    return cleaned.length > 0 ? cleaned : null;
}

function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated && req.isAuthenticated()) return next();
    return res.status(401).json({ error: 'unauthorized', message: 'Sign in first' });
}

router.post('/api/auth/device/pair/start', startLimiter, async (req, res) => {
    const body = req.body || {};

    if (!CODE_CHALLENGE_RE.test(String(body.code_challenge || ''))) {
        return res.status(400).json({ error: 'invalid_request', message: 'Invalid code challenge' });
    }
    if (!PLATFORMS.has(String(body.platform))) {
        return res.status(400).json({ error: 'invalid_request', message: 'platform must be win32, darwin or linux' });
    }

    try {
        const deviceCode = crypto.randomBytes(32).toString('base64url');
        const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);

        let userCode = null;
        for (let attempt = 0; attempt < 8 && !userCode; attempt += 1) {
            const candidate = newUserCode();
            const [clash] = await pool.query(
                `SELECT 1 AS taken FROM device_pairing_codes
                  WHERE user_code = ? AND consumed_at IS NULL AND denied_at IS NULL AND expires_at > NOW()`,
                [candidate]
            );
            if (clash.length === 0) userCode = candidate;
        }
        if (!userCode) {
            return res.status(503).json({ error: 'server_error', message: 'Could not allocate a code' });
        }

        await pool.query(
            `INSERT INTO device_pairing_codes
                (user_code, device_code_hash, code_challenge, device_name, platform, expires_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                userCode,
                sha256(deviceCode),
                String(body.code_challenge),
                cleanDeviceName(body.device_name),
                String(body.platform),
                expiresAt
            ]
        );

        const base = process.env.SITE_URL || `${req.protocol}://${req.get('host')}`;
        return res.status(201).json({
            userCode,
            deviceCode,
            verificationUri: `${base.replace(/\/+$/, '')}/link`,
            expiresIn: Math.floor(PAIRING_TTL_MS / 1000),
            interval: POLL_INTERVAL_SECONDS
        });
    } catch (err) {
        console.error('[LuxCloud] Pairing start failed:', err);
        return res.status(500).json({ error: 'server_error', message: 'Could not start pairing' });
    }
});

router.get('/api/auth/device/pair/lookup', lookupLimiter, ensureAuthenticated, async (req, res) => {
    const userCode = String(req.query.code || '').trim().toUpperCase();
    if (!USER_CODE_RE.test(userCode)) {
        return res.status(400).json({ error: 'invalid_code', message: 'That is not a valid code' });
    }

    try {
        const [rows] = await pool.query(
            `SELECT device_name, platform, created_at FROM device_pairing_codes
              WHERE user_code = ? AND consumed_at IS NULL AND denied_at IS NULL
                AND approved_at IS NULL AND expires_at > NOW()`,
            [userCode]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'invalid_code', message: 'Unknown or expired code' });
        }

        return res.json({
            deviceName: rows[0].device_name,
            platform: rows[0].platform,
            requestedAt: rows[0].created_at
        });
    } catch (err) {
        console.error('[LuxCloud] Pairing lookup failed:', err);
        return res.status(500).json({ error: 'server_error', message: 'Could not read the code' });
    }
});

router.post('/api/auth/device/pair/approve', lookupLimiter, ensureAuthenticated, async (req, res) => {
    const userCode = String((req.body || {}).code || '').trim().toUpperCase();
    if (!USER_CODE_RE.test(userCode)) {
        return res.status(400).json({ error: 'invalid_code', message: 'That is not a valid code' });
    }
    if (req.user.banned) {
        return res.status(403).json({ error: 'forbidden', message: 'Account is banned' });
    }
    if (req.user.cloud_banned) {
        return res.status(403).json({
            error: 'cloud_banned',
            message: req.user.cloud_ban_reason || 'Lux Cloud has been disabled for this account'
        });
    }

    try {
        const [result] = await pool.query(
            `UPDATE device_pairing_codes
                SET user_id = ?, approved_at = NOW()
              WHERE user_code = ? AND consumed_at IS NULL AND denied_at IS NULL
                AND approved_at IS NULL AND expires_at > NOW()`,
            [req.user.id, userCode]
        );

        if (!result || result.affectedRows === 0) {
            return res.status(404).json({ error: 'invalid_code', message: 'Unknown or expired code' });
        }
        return res.json({ ok: true });
    } catch (err) {
        console.error('[LuxCloud] Pairing approval failed:', err);
        return res.status(500).json({ error: 'server_error', message: 'Could not approve the code' });
    }
});

router.post('/api/auth/device/pair/deny', lookupLimiter, ensureAuthenticated, async (req, res) => {
    const userCode = String((req.body || {}).code || '').trim().toUpperCase();
    if (!USER_CODE_RE.test(userCode)) {
        return res.status(400).json({ error: 'invalid_code', message: 'That is not a valid code' });
    }

    try {
        await pool.query(
            `UPDATE device_pairing_codes SET denied_at = NOW()
              WHERE user_code = ? AND consumed_at IS NULL AND denied_at IS NULL AND expires_at > NOW()`,
            [userCode]
        );
        return res.json({ ok: true });
    } catch (err) {
        console.error('[LuxCloud] Pairing denial failed:', err);
        return res.status(500).json({ error: 'server_error', message: 'Could not deny the code' });
    }
});

router.post('/api/auth/device/pair/poll', pollLimiter, async (req, res) => {
    const body = req.body || {};
    const deviceCode = String(body.device_code || '');
    const verifier = String(body.code_verifier || '');
    const deviceUuid = String(body.device_uuid || '');

    if (!deviceCode || !verifier || !deviceUuid) {
        return res.status(400).json({ error: 'invalid_request', message: 'Missing pairing fields' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [rows] = await connection.query(
            'SELECT * FROM device_pairing_codes WHERE device_code_hash = ? FOR UPDATE',
            [sha256(deviceCode)]
        );
        const entry = rows[0];

        if (!entry) {
            await connection.rollback();
            return res.status(400).json({ error: 'invalid_grant', message: 'Unknown pairing request' });
        }
        if (entry.consumed_at) {
            await connection.rollback();
            return res.status(400).json({ error: 'invalid_grant', message: 'This code was already used' });
        }
        if (entry.denied_at) {
            await connection.rollback();
            return res.status(400).json({ error: 'access_denied', message: 'The request was declined' });
        }
        if (new Date(entry.expires_at).getTime() < Date.now()) {
            await connection.rollback();
            return res.status(400).json({ error: 'expired_token', message: 'The code has expired' });
        }
        if (Number(entry.poll_count) > MAX_POLLS) {
            await connection.rollback();
            return res.status(400).json({ error: 'expired_token', message: 'Polled too many times' });
        }

        if (!entry.approved_at || !entry.user_id) {
            await connection.query(
                'UPDATE device_pairing_codes SET poll_count = poll_count + 1, last_polled_at = NOW() WHERE id = ?',
                [entry.id]
            );
            await connection.commit();
            return res.status(202).json({
                error: 'authorization_pending',
                message: 'Waiting for approval',
                interval: POLL_INTERVAL_SECONDS
            });
        }

        const expectedChallenge = crypto.createHash('sha256').update(verifier).digest('base64url');
        if (expectedChallenge !== entry.code_challenge) {
            await connection.query('UPDATE device_pairing_codes SET denied_at = NOW() WHERE id = ?', [entry.id]);
            await connection.commit();
            return res.status(400).json({ error: 'invalid_grant', message: 'Verifier does not match' });
        }

        const [userRows] = await connection.query(
            'SELECT id, username, avatar, banned, cloud_banned, cloud_ban_reason FROM users WHERE id = ?',
            [entry.user_id]
        );
        const user = userRows[0];
        if (!user || user.banned) {
            await connection.rollback();
            return res.status(403).json({ error: 'forbidden', message: 'Account is banned' });
        }
        if (user.cloud_banned) {
            await connection.rollback();
            return res.status(403).json({
                error: 'cloud_banned',
                message: user.cloud_ban_reason || 'Lux Cloud has been disabled for this account'
            });
        }

        await connection.query('UPDATE device_pairing_codes SET consumed_at = NOW() WHERE id = ?', [entry.id]);

        const [existing] = await connection.query(
            'SELECT id, user_id, token_generation FROM client_devices WHERE device_uuid = ?',
            [deviceUuid]
        );

        if (existing.length > 0 && Number(existing[0].user_id) !== Number(user.id)) {
            await connection.commit();
            return res.status(409).json({
                error: 'device_conflict',
                message: 'This device id already belongs to another account'
            });
        }

        const refresh = crypto.randomBytes(32).toString('base64url');
        const refreshExpires = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
        let generation = 1;

        if (existing.length > 0) {
            generation = Number(existing[0].token_generation) || 1;
            await connection.query(
                `UPDATE client_devices
                    SET name = ?, platform = ?, app_version = ?, refresh_token_hash = ?,
                        refresh_expires_at = ?, revoked_at = NULL, last_seen_at = NOW()
                  WHERE id = ?`,
                [
                    cleanDeviceName(body.device_name) || entry.device_name,
                    PLATFORMS.has(String(body.platform)) ? String(body.platform) : entry.platform,
                    body.app_version ? String(body.app_version).slice(0, 20) : null,
                    sha256(refresh),
                    refreshExpires,
                    existing[0].id
                ]
            );
        } else {
            await connection.query(
                `INSERT INTO client_devices
                    (user_id, device_uuid, name, platform, app_version, refresh_token_hash,
                     refresh_expires_at, token_generation, last_seen_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                [
                    user.id,
                    deviceUuid,
                    cleanDeviceName(body.device_name) || entry.device_name,
                    PLATFORMS.has(String(body.platform)) ? String(body.platform) : entry.platform,
                    body.app_version ? String(body.app_version).slice(0, 20) : null,
                    sha256(refresh),
                    refreshExpires,
                    generation
                ]
            );
        }

        await connection.commit();

        return res.json({
            accessToken: signAccessToken({ userId: user.id, deviceUuid, generation }),
            refreshToken: refresh,
            expiresIn: ACCESS_TTL_SECONDS,
            user: { id: user.id, username: user.username, avatar: user.avatar || null }
        });
    } catch (err) {
        await connection.rollback().catch(() => {});
        console.error('[LuxCloud] Pairing poll failed:', err);
        return res.status(500).json({ error: 'server_error', message: 'Could not complete pairing' });
    } finally {
        connection.release();
    }
});

async function prunePairingCodes() {
    try {
        const [result] = await pool.query(
            `DELETE FROM device_pairing_codes
              WHERE expires_at < NOW() - INTERVAL '1 hour'
                 OR consumed_at < NOW() - INTERVAL '1 hour'`
        );
        if (result && result.affectedRows > 0) {
            console.log(`[LuxCloud] Pruned ${result.affectedRows} pairing code(s).`);
        }
    } catch (err) {
        console.error('[LuxCloud] Failed to prune pairing codes:', err.message);
    }
}

module.exports = router;
module.exports.prunePairingCodes = prunePairingCodes;
module.exports.USER_CODE_RE = USER_CODE_RE;
