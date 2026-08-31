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

module.exports = router;
