const express = require('express');
const pool = require('../database');
const {
    cloudError,
    ensureCloudSettingsRow,
    ensureCloudUser,
    ensureDeviceAuth
} = require('../middleware/deviceAuth');
const {
    MAX_BATCH_BYTES,
    MAX_BATCH_ENTRIES,
    MAX_BLOB_BYTES,
    SUPPORTED_COMPRESSIONS,
    INSTANCE_UUID_RE,
    LOADER_RE,
    LOADER_VERSION_RE,
    MC_VERSION_RE,
    cleanText,
    expiresAt,
    purgesAt
} = require('../cloudConfig');
const { getStorage } = require('../storage');
const {
    INSTANCE_COLUMNS,
    PATCHABLE_FIELDS,
    countActiveInstances,
    decorate,
    ownedInstance,
    serializeInstance
} = require('../cloudInstances');
const { purgeCloudData } = require('../cloudAccount');

const router = express.Router();

const SESSION_STALE_MINUTES = Number(process.env.LUXCLOUD_SESSION_STALE_MINUTES || 5);

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
        const instanceCount = await countActiveInstances(req.cloudUserId);

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
                instanceCount,
                maxInstances: Number(settings.max_instances || 0)
            },
            deviceCount: Number(deviceRows[0] ? deviceRows[0].count : 0),
            capabilities: {
                compression: SUPPORTED_COMPRESSIONS,
                maxBlobBytes: MAX_BLOB_BYTES,
                maxBatchBytes: MAX_BATCH_BYTES,
                maxBatchEntries: MAX_BATCH_ENTRIES,
                storageDriver: getStorage().driver
            },
            serverTime: Date.now()
        });
    } catch (err) {
        console.error('[LuxCloud] GET /me failed:', err);
        return cloudError(res, 500, 'server_error', 'Could not load account');
    }
});

router.delete('/me', ensureCloudUser, async (req, res) => {
    if (String(req.body && req.body.confirm) !== 'delete-my-cloud-data') {
        return cloudError(res, 400, 'invalid_request', 'Missing confirmation');
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const result = await purgeCloudData(req.cloudUserId, connection);
        await connection.commit();

        console.log(`[LuxCloud] Cloud data purged for user ${req.cloudUserId}:`, result);
        return res.json({
            ok: true,
            ...result,
            note: 'Local instance files on any device are untouched.'
        });
    } catch (err) {
        await connection.rollback().catch(() => {});
        console.error('[LuxCloud] DELETE /me failed:', err);
        return cloudError(res, 500, 'server_error', 'Could not delete cloud data');
    } finally {
        connection.release();
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


router.get('/instances', ensureCloudUser, async (req, res) => {
    const status = ['active', 'trashed', 'all'].includes(String(req.query.status))
        ? String(req.query.status)
        : 'active';

    try {
        const params = [req.cloudUserId];
        let sql = `SELECT ${INSTANCE_COLUMNS} FROM cloud_instances i WHERE i.user_id = ?`;
        if (status !== 'all') {
            sql += ' AND i.status = ?';
            params.push(status);
        }
        sql += ' ORDER BY i.last_touched_at DESC';

        const [rows] = await pool.query(sql, params);
        const decorated = await decorate(rows);
        return res.json({ instances: decorated.map(serializeInstance) });
    } catch (err) {
        console.error('[LuxCloud] GET /instances failed:', err);
        return cloudError(res, 500, 'server_error', 'Could not list instances');
    }
});

router.get('/instances/:uuid/head', ensureDeviceAuth, async (req, res) => {
    if (!INSTANCE_UUID_RE.test(String(req.params.uuid))) {
        return cloudError(res, 404, 'not_found', 'Instance not found');
    }

    try {
        const [rows] = await pool.query(
            `SELECT i.id, i.current_revision, i.updated_at, i.last_touched_at,
                    i.last_foreign_pull_at, i.created_at,
                    r.manifest_blob AS manifest_hash,
                    s.session_uuid, s.started_at,
                    d.device_uuid AS session_device_uuid, d.name AS session_device_name
               FROM cloud_instances i
               LEFT JOIN cloud_revisions r ON r.instance_id = i.id AND r.revision = i.current_revision
               LEFT JOIN cloud_sessions s ON s.instance_id = i.id AND s.ended_at IS NULL
                    AND s.last_heartbeat_at > NOW() - INTERVAL '${SESSION_STALE_MINUTES} minutes'
               LEFT JOIN client_devices d ON d.id = s.device_id
              WHERE i.user_id = ? AND i.instance_uuid = ? AND i.status = ?
              ORDER BY s.started_at DESC
              LIMIT 1`,
            [req.cloudUserId, String(req.params.uuid), 'active']
        );

        const row = rows[0];
        if (!row) return cloudError(res, 404, 'not_found', 'Instance not found');

        const [playtimeRows] = await pool.query(
            'SELECT COALESCE(SUM(total_ms), 0) AS total_ms FROM cloud_instance_playtime WHERE instance_id = ?',
            [row.id]
        );

        if (String(req.query.touch) === '1') {
            await pool.query('UPDATE cloud_instances SET last_touched_at = NOW() WHERE id = ?', [row.id]);
        }

        return res.json({
            revision: Number(row.current_revision),
            manifestHash: row.manifest_hash || null,
            updatedAt: new Date(row.updated_at).getTime(),
            playtimeTotalMs: Number(playtimeRows[0] ? playtimeRows[0].total_ms : 0),
            activeSession: row.session_uuid
                ? {
                    sessionId: row.session_uuid,
                    deviceUuid: row.session_device_uuid,
                    deviceName: row.session_device_name,
                    startedAt: new Date(row.started_at).getTime()
                }
                : null,
            expiresAt: expiresAt(row.last_foreign_pull_at || row.created_at),
            everPulledElsewhere: Boolean(row.last_foreign_pull_at)
        });
    } catch (err) {
        console.error('[LuxCloud] GET /instances/:uuid/head failed:', err);
        return cloudError(res, 500, 'server_error', 'Could not read instance head');
    }
});

router.post('/instances', ensureDeviceAuth, async (req, res) => {
    const body = req.body || {};
    const instanceUuid = String(body.instanceUuid || '');
    const name = cleanText(body.name, 120);

    if (!INSTANCE_UUID_RE.test(instanceUuid)) {
        return cloudError(res, 400, 'invalid_request', 'Invalid instance id');
    }
    if (!name) {
        return cloudError(res, 400, 'invalid_request', 'Missing instance name');
    }
    if (body.mcVersion && !MC_VERSION_RE.test(String(body.mcVersion))) {
        return cloudError(res, 400, 'invalid_request', 'Invalid Minecraft version');
    }
    if (body.loader && !LOADER_RE.test(String(body.loader))) {
        return cloudError(res, 400, 'invalid_request', 'Invalid loader');
    }
    if (body.loaderVersion && !LOADER_VERSION_RE.test(String(body.loaderVersion))) {
        return cloudError(res, 400, 'invalid_request', 'Invalid loader version');
    }
    for (const key of Object.keys(PATCHABLE_FIELDS)) {
        if (key in body && typeof body[key] !== 'boolean') {
            return cloudError(res, 400, 'invalid_request', `${key} must be a boolean`);
        }
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        await ensureCloudSettingsRow(req.cloudUserId, connection);

        const [settingsRows] = await connection.query(
            `SELECT max_instances, cross_platform_default, sync_worlds_default, sync_screenshots_default
               FROM user_cloud_settings WHERE user_id = ? FOR UPDATE`,
            [req.cloudUserId]
        );
        const settings = settingsRows[0];

        const existing = await ownedInstance(req.cloudUserId, instanceUuid, {
            status: 'any',
            executor: connection
        });
        if (existing && existing.status === 'active') {
            await connection.commit();
            return res.status(200).json({ instance: serializeInstance(existing), created: false });
        }
        if (existing && existing.status === 'trashed') {
            await connection.rollback();
            return cloudError(res, 409, 'instance_trashed', 'This instance is in the trash. Restore it instead.');
        }

        const active = await countActiveInstances(req.cloudUserId, connection);
        if (active >= Number(settings.max_instances)) {
            await connection.rollback();
            return cloudError(res, 409, 'instance_limit_reached', 'Cloud instance limit reached', {
                details: { instanceCount: active, maxInstances: Number(settings.max_instances) }
            });
        }

        const pick = (key, fallback) => (key in body ? Boolean(body[key]) : Boolean(fallback));

        await connection.query(
            `INSERT INTO cloud_instances
                (user_id, instance_uuid, name, mc_version, loader, loader_version,
                 origin_platform, cross_platform, sync_worlds, sync_screenshots)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.cloudUserId,
                instanceUuid,
                name,
                body.mcVersion ? String(body.mcVersion) : null,
                body.loader ? String(body.loader) : null,
                body.loaderVersion ? String(body.loaderVersion) : null,
                req.device.platform,
                pick('crossPlatform', settings.cross_platform_default),
                pick('syncWorlds', settings.sync_worlds_default),
                pick('syncScreenshots', settings.sync_screenshots_default)
            ]
        );

        const created = await ownedInstance(req.cloudUserId, instanceUuid, { executor: connection });
        await connection.commit();

        return res.status(201).json({ instance: serializeInstance(created), created: true });
    } catch (err) {
        await connection.rollback().catch(() => {});
        console.error('[LuxCloud] POST /instances failed:', err);
        return cloudError(res, 500, 'server_error', 'Could not create instance');
    } finally {
        connection.release();
    }
});

router.patch('/instances/:uuid', ensureCloudUser, async (req, res) => {
    const body = req.body || {};
    const assignments = [];
    const params = [];

    if ('name' in body) {
        const name = cleanText(body.name, 120);
        if (!name) return cloudError(res, 400, 'invalid_request', 'Invalid instance name');
        assignments.push('name = ?');
        params.push(name);
    }
    for (const [key, column] of Object.entries(PATCHABLE_FIELDS)) {
        if (!(key in body)) continue;
        if (typeof body[key] !== 'boolean') {
            return cloudError(res, 400, 'invalid_request', `${key} must be a boolean`);
        }
        assignments.push(`${column} = ?`);
        params.push(body[key]);
    }

    if (assignments.length === 0) {
        return cloudError(res, 400, 'invalid_request', 'No supported fields in request');
    }

    try {
        const instance = await ownedInstance(req.cloudUserId, req.params.uuid);
        if (!instance) return cloudError(res, 404, 'not_found', 'Instance not found');

        params.push(instance.id);
        await pool.query(
            `UPDATE cloud_instances SET ${assignments.join(', ')}, updated_at = NOW() WHERE id = ?`,
            params
        );

        const updated = await ownedInstance(req.cloudUserId, req.params.uuid);
        return res.json({ instance: serializeInstance(updated) });
    } catch (err) {
        console.error('[LuxCloud] PATCH /instances/:uuid failed:', err);
        return cloudError(res, 500, 'server_error', 'Could not update instance');
    }
});

router.delete('/instances/:uuid', ensureCloudUser, async (req, res) => {
    try {
        const [result] = await pool.query(
            `UPDATE cloud_instances
                SET status = ?, trashed_at = NOW(), updated_at = NOW()
              WHERE user_id = ? AND instance_uuid = ? AND status = ?`,
            ['trashed', req.cloudUserId, String(req.params.uuid), 'active']
        );

        if (!result || result.affectedRows === 0) {
            return cloudError(res, 404, 'not_found', 'Instance not found');
        }

        const instance = await ownedInstance(req.cloudUserId, req.params.uuid, { status: 'trashed' });
        return res.json({ instance: instance ? serializeInstance(instance) : null });
    } catch (err) {
        console.error('[LuxCloud] DELETE /instances/:uuid failed:', err);
        return cloudError(res, 500, 'server_error', 'Could not delete instance');
    }
});

router.post('/instances/:uuid/restore', ensureCloudUser, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        await ensureCloudSettingsRow(req.cloudUserId, connection);

        const [settingsRows] = await connection.query(
            'SELECT max_instances FROM user_cloud_settings WHERE user_id = ? FOR UPDATE',
            [req.cloudUserId]
        );
        const maxInstances = Number(settingsRows[0].max_instances);

        const instance = await ownedInstance(req.cloudUserId, req.params.uuid, {
            status: 'trashed',
            executor: connection
        });
        if (!instance) {
            await connection.rollback();
            return cloudError(res, 404, 'not_found', 'Instance not found');
        }

        const active = await countActiveInstances(req.cloudUserId, connection);
        if (active >= maxInstances) {
            await connection.rollback();
            return cloudError(res, 409, 'instance_limit_reached', 'Cloud instance limit reached', {
                details: { instanceCount: active, maxInstances }
            });
        }

        await connection.query(
            `UPDATE cloud_instances
                SET status = ?, trashed_at = NULL, last_touched_at = NOW(), updated_at = NOW()
              WHERE id = ?`,
            ['active', instance.id]
        );

        const restored = await ownedInstance(req.cloudUserId, req.params.uuid, { executor: connection });
        await connection.commit();

        return res.json({ instance: serializeInstance(restored) });
    } catch (err) {
        await connection.rollback().catch(() => {});
        console.error('[LuxCloud] POST /instances/:uuid/restore failed:', err);
        return cloudError(res, 500, 'server_error', 'Could not restore instance');
    } finally {
        connection.release();
    }
});

module.exports = router;
