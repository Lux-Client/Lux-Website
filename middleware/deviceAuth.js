const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../database');

const ACCESS_TTL_SECONDS = Number(process.env.LUXCLOUD_ACCESS_TTL_SECONDS || 3600);
const REFRESH_TTL_DAYS = Number(process.env.LUXCLOUD_REFRESH_TTL_DAYS || 90);
const REFRESH_GRACE_MS = Number(process.env.LUXCLOUD_REFRESH_GRACE_MS || 30000);

const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;
const lastSeenWrites = new Map();

let cachedSecret = null;

function getJwtSecret() {
    if (cachedSecret) return cachedSecret;

    const secret = process.env.LUXCLOUD_JWT_SECRET;
    if (secret && secret.length >= 32) {
        cachedSecret = secret;
        return cachedSecret;
    }

    if (process.env.NODE_ENV === 'production') {
        throw new Error('LUXCLOUD_JWT_SECRET is missing or shorter than 32 characters');
    }

    console.warn('[LuxCloud] LUXCLOUD_JWT_SECRET not set - using an ephemeral development secret.');
    cachedSecret = crypto.randomBytes(48).toString('hex');
    return cachedSecret;
}

function sha256(value) {
    return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function signAccessToken({ userId, deviceUuid, generation }) {
    return jwt.sign(
        { sub: String(userId), dev: deviceUuid, gen: generation },
        getJwtSecret(),
        { algorithm: 'HS256', expiresIn: ACCESS_TTL_SECONDS }
    );
}

function verifyAccessToken(token) {
    return jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
}

function cloudError(res, status, error, message, extra = {}) {
    return res.status(status).json({ error, message, ...extra });
}

function readBearer(req) {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return null;
    const token = header.slice(7).trim();
    return token.length > 0 ? token : null;
}

function clientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
        return forwarded.split(',')[0].trim().slice(0, 45);
    }
    return String(req.ip || '').slice(0, 45);
}

async function touchLastSeen(deviceId, deviceUuid, ip) {
    const now = Date.now();
    const previous = lastSeenWrites.get(deviceUuid);
    if (previous && now - previous < LAST_SEEN_THROTTLE_MS) return;
    lastSeenWrites.set(deviceUuid, now);

    try {
        await pool.query(
            'UPDATE client_devices SET last_seen_at = NOW(), last_ip = ? WHERE id = ?',
            [ip || null, deviceId]
        );
    } catch (err) {
        console.error('[LuxCloud] Failed to update last_seen_at:', err.message);
    }
}

async function ensureDeviceAuth(req, res, next) {
    const token = readBearer(req);
    if (!token) {
        return cloudError(res, 401, 'unauthorized', 'Authorization header missing');
    }

    let payload;
    try {
        payload = verifyAccessToken(token);
    } catch (err) {
        if (err && err.name === 'TokenExpiredError') {
            return cloudError(res, 401, 'token_expired', 'Access token expired');
        }
        return cloudError(res, 401, 'unauthorized', 'Invalid access token');
    }

    try {
        const [rows] = await pool.query(
            `SELECT d.id, d.user_id, d.device_uuid, d.name, d.platform, d.token_generation,
                    d.revoked_at, u.username, u.avatar, u.banned, u.role,
                    u.cloud_banned, u.cloud_ban_reason
               FROM client_devices d
               JOIN users u ON u.id = d.user_id
              WHERE d.device_uuid = ?`,
            [payload.dev]
        );

        const device = rows[0];
        if (!device || device.revoked_at) {
            return cloudError(res, 401, 'device_revoked', 'This device is no longer authorized');
        }
        if (Number(device.user_id) !== Number(payload.sub)) {
            return cloudError(res, 401, 'device_revoked', 'This device belongs to another account');
        }
        if (Number(device.token_generation) !== Number(payload.gen)) {
            return cloudError(res, 401, 'device_revoked', 'This session was invalidated');
        }
        if (device.banned) {
            return cloudError(res, 403, 'forbidden', 'Account is banned');
        }
        if (device.cloud_banned) {
            return cloudError(res, 403, 'cloud_banned',
                device.cloud_ban_reason || 'Lux Cloud has been disabled for this account');
        }

        req.device = {
            id: device.id,
            uuid: device.device_uuid,
            name: device.name,
            platform: device.platform,
            generation: device.token_generation
        };
        req.cloudUser = {
            id: device.user_id,
            username: device.username,
            avatar: device.avatar,
            role: device.role
        };
        req.cloudUserId = device.user_id;

        touchLastSeen(device.id, device.device_uuid, clientIp(req));
        return next();
    } catch (err) {
        console.error('[LuxCloud] ensureDeviceAuth failed:', err);
        return cloudError(res, 500, 'server_error', 'Authentication check failed');
    }
}

async function ensureCloudUser(req, res, next) {
    if (readBearer(req)) {
        return ensureDeviceAuth(req, res, next);
    }

    if (typeof req.isAuthenticated === 'function' && req.isAuthenticated()) {
        if (req.user && req.user.banned) {
            return cloudError(res, 403, 'forbidden', 'Account is banned');
        }
        // The same ban has to hold on the website session, not just on device tokens --
        // otherwise a banned account could still manage its cloud data from the browser.
        if (req.user && req.user.cloud_banned) {
            return cloudError(res, 403, 'cloud_banned',
                req.user.cloud_ban_reason || 'Lux Cloud has been disabled for this account');
        }
        req.cloudUser = req.user;
        req.cloudUserId = req.user.id;
        req.device = null;
        return next();
    }

    return cloudError(res, 401, 'unauthorized', 'Not authenticated');
}

async function ensureCloudSettingsRow(userId, executor = pool) {
    await executor.query(
        `INSERT INTO user_cloud_settings (user_id) VALUES (?)
         ON CONFLICT (user_id) DO NOTHING
         RETURNING user_id`,
        [userId]
    );
}

module.exports = {
    ACCESS_TTL_SECONDS,
    REFRESH_TTL_DAYS,
    REFRESH_GRACE_MS,
    cloudError,
    clientIp,
    ensureCloudSettingsRow,
    ensureCloudUser,
    ensureDeviceAuth,
    getJwtSecret,
    sha256,
    signAccessToken,
    verifyAccessToken
};
