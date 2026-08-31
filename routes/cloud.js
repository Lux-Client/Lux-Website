const express = require('express');
const pool = require('../database');
const {
    cloudError,
    ensureCloudSettingsRow,
    ensureCloudUser,
    ensureDeviceAuth
} = require('../middleware/deviceAuth');

const router = express.Router();

const SETTINGS_FIELDS = {
    cloudSyncEnabled: 'cloud_sync_enabled',
    autoSync: 'auto_sync',
    crossPlatformDefault: 'cross_platform_default',
    syncWorldsDefault: 'sync_worlds_default',
    syncScreenshotsDefault: 'sync_screenshots_default'
};

async function loadSettings(userId) {
    await ensureCloudSettingsRow(userId);
    const [rows] = await pool.query('SELECT * FROM user_cloud_settings WHERE user_id = ?', [userId]);
    return rows[0] || null;
}

function serializeSettings(row) {
    return {
        cloudSyncEnabled: Boolean(row.cloud_sync_enabled),
        autoSync: Boolean(row.auto_sync),
        crossPlatformDefault: Boolean(row.cross_platform_default),
        syncWorldsDefault: Boolean(row.sync_worlds_default),
        syncScreenshotsDefault: Boolean(row.sync_screenshots_default)
    };
}

function serializeDevice(row, currentDeviceUuid) {
    return {
        deviceUuid: row.device_uuid,
        name: row.name,
        platform: row.platform,
        appVersion: row.app_version,
        lastSeenAt: row.last_seen_at,
        createdAt: row.created_at,
        isCurrent: Boolean(currentDeviceUuid) && row.device_uuid === currentDeviceUuid
    };
}

router.get('/me', ensureDeviceAuth, async (req, res) => {
    try {
        const settings = await loadSettings(req.cloudUserId);
        const [deviceRows] = await pool.query(
            'SELECT COUNT(*) AS count FROM client_devices WHERE user_id = ? AND revoked_at IS NULL',
            [req.cloudUserId]
        );

        return res.json({
            user: {
                id: req.cloudUser.id,
                username: req.cloudUser.username,
                avatar: req.cloudUser.avatar || null
            },
            device: {
                deviceUuid: req.device.uuid,
                name: req.device.name,
                platform: req.device.platform
            },
            settings: serializeSettings(settings),
            quota: {
                usedBytes: Number(settings.used_bytes || 0),
                quotaBytes: Number(settings.quota_bytes || 0),
                instanceCount: 0,
                maxInstances: Number(settings.max_instances || 0)
            },
            deviceCount: Number(deviceRows[0] ? deviceRows[0].count : 0),
            serverTime: Date.now()
        });
    } catch (err) {
        console.error('[LuxCloud] GET /me failed:', err);
        return cloudError(res, 500, 'server_error', 'Could not load account');
    }
});

router.patch('/me/settings', ensureCloudUser, async (req, res) => {
    const body = req.body || {};
    const assignments = [];
    const params = [];

    for (const [apiKey, column] of Object.entries(SETTINGS_FIELDS)) {
        if (!(apiKey in body)) continue;
        if (typeof body[apiKey] !== 'boolean') {
            return cloudError(res, 400, 'invalid_request', `${apiKey} must be a boolean`);
        }
        assignments.push(`${column} = ?`);
        params.push(body[apiKey]);
    }

    if (assignments.length === 0) {
        return cloudError(res, 400, 'invalid_request', 'No supported settings in request');
    }

    try {
        await ensureCloudSettingsRow(req.cloudUserId);
        params.push(req.cloudUserId);
        await pool.query(
            `UPDATE user_cloud_settings SET ${assignments.join(', ')}, updated_at = NOW() WHERE user_id = ?`,
            params
        );

        const settings = await loadSettings(req.cloudUserId);
        return res.json({ settings: serializeSettings(settings) });
    } catch (err) {
        console.error('[LuxCloud] PATCH /me/settings failed:', err);
        return cloudError(res, 500, 'server_error', 'Could not save settings');
    }
});

router.get('/devices', ensureCloudUser, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT device_uuid, name, platform, app_version, last_seen_at, created_at
               FROM client_devices
              WHERE user_id = ? AND revoked_at IS NULL
              ORDER BY last_seen_at DESC NULLS LAST, created_at DESC`,
            [req.cloudUserId]
        );

        const currentUuid = req.device ? req.device.uuid : null;
        return res.json({ devices: rows.map((row) => serializeDevice(row, currentUuid)) });
    } catch (err) {
        console.error('[LuxCloud] GET /devices failed:', err);
        return cloudError(res, 500, 'server_error', 'Could not list devices');
    }
});

router.delete('/devices/:uuid', ensureCloudUser, async (req, res) => {
    try {
        const [result] = await pool.query(
            `UPDATE client_devices
                SET revoked_at = NOW(),
                    refresh_token_hash = NULL,
                    refresh_expires_at = NULL,
                    prev_refresh_token_hash = NULL,
                    prev_refresh_valid_until = NULL,
                    token_generation = token_generation + 1
              WHERE user_id = ? AND device_uuid = ? AND revoked_at IS NULL`,
            [req.cloudUserId, String(req.params.uuid)]
        );

        if (!result || result.affectedRows === 0) {
            return cloudError(res, 404, 'not_found', 'Device not found');
        }
        return res.json({ ok: true });
    } catch (err) {
        console.error('[LuxCloud] DELETE /devices failed:', err);
        return cloudError(res, 500, 'server_error', 'Could not revoke device');
    }
});

module.exports = router;
