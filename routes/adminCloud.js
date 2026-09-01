const express = require('express');
const pool = require('../database');
const { getGcStatus, runGc, runReconcile } = require('../jobs/cloudGc');

const router = express.Router();

function ensureAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.role === 'admin') return next();
    return res.status(403).json({ error: 'Forbidden' });
}

async function logAdminAction(req, action, targetType, targetId, details = null) {
    try {
        await pool.query(
            'INSERT INTO admin_audit_log (admin_user_id, admin_label, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?)',
            [req.user.id, req.user.username, action, targetType, String(targetId), details]
        );
    } catch (err) {
        console.error('[AuditLog] Failed to record admin action:', err);
    }
}

router.get('/gc', ensureAdmin, async (req, res) => {
    try {
        return res.json(await getGcStatus());
    } catch (err) {
        console.error('[LuxCloud] GET /api/admin/cloud/gc failed:', err);
        return res.status(500).json({ error: 'server_error', message: 'Could not read GC status' });
    }
});

router.post('/gc/run', ensureAdmin, async (req, res) => {
    const mode = String(req.body && req.body.mode ? req.body.mode : 'gc');
    if (!['gc', 'reconcile'].includes(mode)) {
        return res.status(400).json({ error: 'invalid_request', message: 'mode must be gc or reconcile' });
    }
    const dryRun = req.body && typeof req.body.dryRun === 'boolean' ? req.body.dryRun : undefined;

    try {
        const options = dryRun === undefined ? {} : { dryRun };
        const result = mode === 'reconcile' ? await runReconcile(options) : await runGc(options);
        await logAdminAction(req, `cloud_${mode}_run`, 'cloud', mode, JSON.stringify(result));
        return res.json({ result });
    } catch (err) {
        console.error('[LuxCloud] POST /api/admin/cloud/gc/run failed:', err);
        return res.status(500).json({ error: 'server_error', message: 'Job failed' });
    }
});

router.get('/stats', ensureAdmin, async (req, res) => {
    try {
        const [blobRows] = await pool.query(
            `SELECT COUNT(*) AS blob_count,
                    COALESCE(SUM(size), 0) AS logical_bytes,
                    COALESCE(SUM(stored_size), 0) AS physical_bytes,
                    COALESCE(SUM(CASE WHEN refcount <= 0 THEN 1 ELSE 0 END), 0) AS orphan_count
               FROM blobs`
        );
        const [refRows] = await pool.query('SELECT COUNT(*) AS count FROM blob_refs');
        const [instanceRows] = await pool.query(
            `SELECT COUNT(*) AS total,
                    COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active,
                    COALESCE(SUM(CASE WHEN status = 'trashed' THEN 1 ELSE 0 END), 0) AS trashed,
                    COALESCE(SUM(CASE WHEN last_foreign_pull_at IS NULL THEN 1 ELSE 0 END), 0) AS never_pulled
               FROM cloud_instances`
        );
        const [userRows] = await pool.query(
            'SELECT COUNT(*) AS count, COALESCE(SUM(used_bytes), 0) AS billed_bytes FROM user_cloud_settings WHERE used_bytes > 0'
        );
        const [queueRows] = await pool.query('SELECT COUNT(*) AS count FROM blob_gc_queue');

        const blobs = blobRows[0] || {};
        const physical = Number(blobs.physical_bytes || 0);
        const billed = Number(userRows[0] ? userRows[0].billed_bytes : 0);

        return res.json({
            blobs: {
                count: Number(blobs.blob_count || 0),
                logicalBytes: Number(blobs.logical_bytes || 0),
                physicalBytes: physical,
                orphanCount: Number(blobs.orphan_count || 0),
                referenceCount: Number(refRows[0] ? refRows[0].count : 0)
            },
            instances: {
                total: Number(instanceRows[0].total || 0),
                active: Number(instanceRows[0].active || 0),
                trashed: Number(instanceRows[0].trashed || 0),
                neverPulledElsewhere: Number(instanceRows[0].never_pulled || 0)
            },
            users: {
                withData: Number(userRows[0] ? userRows[0].count : 0),
                billedBytes: billed
            },
            dedupFactor: physical > 0 ? Number((billed / physical).toFixed(2)) : null,
            gcQueue: Number(queueRows[0] ? queueRows[0].count : 0)
        });
    } catch (err) {
        console.error('[LuxCloud] GET /api/admin/cloud/stats failed:', err);
        return res.status(500).json({ error: 'server_error', message: 'Could not read stats' });
    }
});

router.get('/users', ensureAdmin, async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);

    try {
        const [rows] = await pool.query(
            `SELECT u.id, u.username, u.email,
                    s.used_bytes, s.quota_bytes, s.max_instances,
                    u.cloud_banned, u.cloud_ban_reason
               FROM user_cloud_settings s
               JOIN users u ON u.id = s.user_id
              ORDER BY s.used_bytes DESC
              LIMIT ?`,
            [limit]
        );

        const ids = rows.map((row) => row.id);
        const counts = new Map();
        if (ids.length > 0) {
            const [countRows] = await pool.query(
                `SELECT user_id, COUNT(*) AS count, MAX(last_touched_at) AS last_activity
                   FROM cloud_instances
                  WHERE status = 'active' AND user_id IN (${ids.map(() => '?').join(', ')})
                  GROUP BY user_id`,
                ids
            );
            for (const row of countRows) {
                counts.set(Number(row.user_id), { count: Number(row.count), lastActivity: row.last_activity });
            }
        }

        return res.json({
            users: rows.map((row) => ({
                id: Number(row.id),
                username: row.username,
                email: row.email,
                usedBytes: Number(row.used_bytes || 0),
                quotaBytes: Number(row.quota_bytes || 0),
                maxInstances: Number(row.max_instances || 0),
                cloudBanned: Boolean(row.cloud_banned),
                cloudBanReason: row.cloud_ban_reason,
                instanceCount: counts.get(Number(row.id))?.count || 0,
                lastActivity: counts.get(Number(row.id))?.lastActivity || null
            }))
        });
    } catch (err) {
        console.error('[LuxCloud] GET /api/admin/cloud/users failed:', err);
        return res.status(500).json({ error: 'server_error', message: 'Could not list users' });
    }
});

router.patch('/users/:id/quota', ensureAdmin, async (req, res) => {
    const userId = Number(req.params.id);
    const body = req.body || {};

    if (!Number.isSafeInteger(userId) || userId <= 0) {
        return res.status(400).json({ error: 'invalid_request', message: 'Bad user id' });
    }

    const assignments = [];
    const params = [];

    if ('quotaBytes' in body) {
        const value = Number(body.quotaBytes);
        if (!Number.isSafeInteger(value) || value < 0) {
            return res.status(400).json({ error: 'invalid_request', message: 'quotaBytes must be a non-negative integer' });
        }
        assignments.push('quota_bytes = ?');
        params.push(value);
    }
    if ('maxInstances' in body) {
        const value = Number(body.maxInstances);
        if (!Number.isSafeInteger(value) || value < 0 || value > 1000) {
            return res.status(400).json({ error: 'invalid_request', message: 'maxInstances out of range' });
        }
        assignments.push('max_instances = ?');
        params.push(value);
    }
    if (assignments.length === 0) {
        return res.status(400).json({ error: 'invalid_request', message: 'Nothing to change' });
    }

    try {
        params.push(userId);
        const [result] = await pool.query(
            `UPDATE user_cloud_settings SET ${assignments.join(', ')}, updated_at = NOW() WHERE user_id = ?`,
            params
        );
        if (!result || result.affectedRows === 0) {
            return res.status(404).json({ error: 'not_found', message: 'User has no cloud settings' });
        }

        await logAdminAction(req, 'cloud_quota_change', 'user', userId, JSON.stringify(body));
        return res.json({ ok: true });
    } catch (err) {
        console.error('[LuxCloud] PATCH /api/admin/cloud/users/:id/quota failed:', err);
        return res.status(500).json({ error: 'server_error', message: 'Could not change the quota' });
    }
});

router.post('/users/:id/ban', ensureAdmin, async (req, res) => {
    const userId = Number(req.params.id);
    const body = req.body || {};
    const banned = body.banned !== false;
    const reason = typeof body.reason === 'string' ? body.reason.slice(0, 500) : null;

    if (!Number.isSafeInteger(userId) || userId <= 0) {
        return res.status(400).json({ error: 'invalid_request', message: 'Bad user id' });
    }
    if (Number(userId) === Number(req.user.id)) {
        return res.status(400).json({ error: 'invalid_request', message: 'You cannot ban yourself' });
    }

    try {
        const [result] = await pool.query(
            `UPDATE users
                SET cloud_banned = ?, cloud_ban_reason = ?, cloud_banned_at = ?
              WHERE id = ?`,
            [banned, banned ? reason : null, banned ? new Date() : null, userId]
        );
        if (!result || result.affectedRows === 0) {
            return res.status(404).json({ error: 'not_found', message: 'User not found' });
        }

        if (banned) {
            // Cut every device loose right away. Without this the account keeps
            // working for up to an hour on the access tokens it already holds.
            await pool.query(
                `UPDATE client_devices
                    SET revoked_at = NOW(), refresh_token_hash = NULL,
                        prev_refresh_token_hash = NULL,
                        token_generation = token_generation + 1
                  WHERE user_id = ? AND revoked_at IS NULL`,
                [userId]
            );
        }

        await pool.query(
            'INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)',
            [
                userId,
                banned
                    ? `Lux Cloud has been disabled for your account.${reason ? ` Reason: ${reason}` : ''} Your local instances are not affected.`
                    : 'Lux Cloud has been re-enabled for your account.',
                banned ? 'error' : 'success'
            ]
        );

        await logAdminAction(req, banned ? 'cloud_ban' : 'cloud_unban', 'user', userId, reason);
        return res.json({ ok: true, banned });
    } catch (err) {
        console.error('[LuxCloud] POST /api/admin/cloud/users/:id/ban failed:', err);
        return res.status(500).json({ error: 'server_error', message: 'Could not change the ban' });
    }
});

router.get('/instances', ensureAdmin, async (req, res) => {
    const userId = Number(req.query.userId);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
        return res.status(400).json({ error: 'invalid_request', message: 'userId is required' });
    }

    try {
        const [rows] = await pool.query(
            `SELECT id, instance_uuid, name, mc_version, loader, current_revision, logical_bytes,
                    status, created_at, last_touched_at, last_foreign_pull_at, trashed_at
               FROM cloud_instances WHERE user_id = ? ORDER BY last_touched_at DESC`,
            [userId]
        );
        return res.json({ instances: rows });
    } catch (err) {
        console.error('[LuxCloud] GET /api/admin/cloud/instances failed:', err);
        return res.status(500).json({ error: 'server_error', message: 'Could not list instances' });
    }
});

router.delete('/instances/:id', ensureAdmin, async (req, res) => {
    const instanceId = Number(req.params.id);
    if (!Number.isSafeInteger(instanceId) || instanceId <= 0) {
        return res.status(400).json({ error: 'invalid_request', message: 'Bad instance id' });
    }

    try {
        const [rows] = await pool.query('SELECT id, user_id, name FROM cloud_instances WHERE id = ?', [instanceId]);
        const instance = rows[0];
        if (!instance) return res.status(404).json({ error: 'not_found', message: 'Instance not found' });

        const { removeRefsForRevision } = require('../cloudBlobs');
        const { recalcUsedBytes } = require('../cloudInstances');

        const [revisions] = await pool.query('SELECT id FROM cloud_revisions WHERE instance_id = ?', [instanceId]);
        for (const revision of revisions) {
            await removeRefsForRevision(revision.id);
        }
        await pool.query('DELETE FROM cloud_instances WHERE id = ?', [instanceId]);
        await recalcUsedBytes(instance.user_id);

        await logAdminAction(req, 'cloud_instance_delete', 'cloud_instance', instanceId, instance.name);
        return res.json({ ok: true, revisionsRemoved: revisions.length });
    } catch (err) {
        console.error('[LuxCloud] DELETE /api/admin/cloud/instances/:id failed:', err);
        return res.status(500).json({ error: 'server_error', message: 'Could not delete the instance' });
    }
});

router.get('/expiry', ensureAdmin, async (req, res) => {
    try {
        const { getExpiryStatus } = require('../jobs/cloudExpiry');
        const { getRetentionStatus } = require('../jobs/cloudRetention');
        return res.json({ expiry: getExpiryStatus(), retention: getRetentionStatus() });
    } catch (err) {
        console.error('[LuxCloud] GET /api/admin/cloud/expiry failed:', err);
        return res.status(500).json({ error: 'server_error', message: 'Could not read job status' });
    }
});

router.post('/expiry/run', ensureAdmin, async (req, res) => {
    const mode = String(req.body && req.body.mode ? req.body.mode : 'expiry');
    if (!['expiry', 'retention'].includes(mode)) {
        return res.status(400).json({ error: 'invalid_request', message: 'mode must be expiry or retention' });
    }
    const dryRun = req.body && typeof req.body.dryRun === 'boolean' ? req.body.dryRun : undefined;

    try {
        const options = dryRun === undefined ? {} : { dryRun };
        const result = mode === 'retention'
            ? await require('../jobs/cloudRetention').runRetention(options)
            : await require('../jobs/cloudExpiry').runExpiry(options);

        await logAdminAction(req, `cloud_${mode}_run`, 'cloud', mode, JSON.stringify(result));
        return res.json({ result });
    } catch (err) {
        console.error('[LuxCloud] POST /api/admin/cloud/expiry/run failed:', err);
        return res.status(500).json({ error: 'server_error', message: 'Job failed' });
    }
});

module.exports = router;
