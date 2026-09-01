const pool = require('../database');
const { removeRefsForRevision } = require('../cloudBlobs');
const { recalcUsedBytes } = require('../cloudInstances');
const {
    EXPIRY_DAYS,
    EXPIRY_WARN_DAYS,
    EXPIRY_FINAL_WARN_DAYS,
    TRASH_RETENTION_DAYS
} = require('../cloudConfig');

const DRY_RUN_DEFAULT = String(process.env.LUXCLOUD_EXPIRY_DRY_RUN
    || process.env.LUXCLOUD_GC_DRY_RUN || '').toLowerCase() === 'true';

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_LIMIT = 20;
const history = [];
let running = false;

function basisOf(row) {
    return new Date(row.last_foreign_pull_at || row.created_at).getTime();
}

function ageDays(row, now) {
    return (now - basisOf(row)) / DAY_MS;
}

async function notify(userId, message, type, dryRun) {
    if (dryRun) return;
    await pool.query(
        'INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)',
        [userId, message, type]
    );
}

function warnText(row, remainingDays) {
    const days = Math.max(1, Math.round(remainingDays));
    return `Your cloud instance "${row.name}" has not been downloaded on another PC yet. `
        + `It will be removed from the Lux Cloud in ${days} day${days === 1 ? '' : 's'}. `
        + `Your local files are not affected.`;
}

function trashedText(row) {
    return `Your cloud instance "${row.name}" was removed from the Lux Cloud because no other PC `
        + `downloaded it within ${EXPIRY_DAYS} days. You can restore it for ${TRASH_RETENTION_DAYS} days. `
        + `Your local files are untouched.`;
}

async function sendExpiryEmail(userId, row, remainingDays) {
    try {
        const emailService = require('../email');
        if (!emailService || typeof emailService.sendEmail !== 'function') return false;

        const [users] = await pool.query('SELECT username, email FROM users WHERE id = ?', [userId]);
        const user = users[0];
        if (!user || !user.email) return false;

        const days = Math.max(1, Math.round(remainingDays));
        await emailService.sendEmail({
            to: user.email,
            subject: `Lux Cloud: "${row.name}" expires in ${days} day${days === 1 ? '' : 's'}`,
            html: `<p>Hi ${user.username},</p>`
                + `<p>Your cloud instance <strong>${row.name}</strong> has never been downloaded on a second PC. `
                + `Lux Cloud is meant for moving instances between machines, so instances that are never picked up `
                + `elsewhere are removed after ${EXPIRY_DAYS} days.</p>`
                + `<p>It will be removed in <strong>${days} day${days === 1 ? '' : 's'}</strong>. `
                + `Open it on another PC to keep it. <strong>Your local files are not affected either way.</strong></p>`
        });
        return true;
    } catch (err) {
        console.error('[LuxCloud Expiry] Could not send the email:', err.message);
        return false;
    }
}

async function trashInstance(row, dryRun) {
    if (dryRun) return;
    await pool.query(
        `UPDATE cloud_instances SET status = ?, trashed_at = NOW(), updated_at = NOW() WHERE id = ?`,
        ['trashed', row.id]
    );
    await recalcUsedBytes(row.user_id);
}

async function purgeInstance(row, dryRun) {
    if (dryRun) return 0;

    const [revisions] = await pool.query('SELECT id FROM cloud_revisions WHERE instance_id = ?', [row.id]);
    for (const revision of revisions) {
        await removeRefsForRevision(revision.id);
    }

    await pool.query('DELETE FROM cloud_instances WHERE id = ?', [row.id]);
    await recalcUsedBytes(row.user_id);
    return revisions.length;
}

function record(entry) {
    history.unshift({ ...entry, finishedAt: new Date().toISOString() });
    history.splice(HISTORY_LIMIT);
    return entry;
}

async function runExpiry({ dryRun = DRY_RUN_DEFAULT } = {}) {
    if (running) return { skipped: true, reason: 'already_running' };
    running = true;

    const started = Date.now();
    const now = Date.now();
    const result = {
        job: 'expiry',
        dryRun,
        examined: 0,
        warned: 0,
        finalWarned: 0,
        emails: 0,
        trashed: 0,
        purged: 0,
        revisionsRemoved: 0
    };

    try {
        const [active] = await pool.query(
            `SELECT id, user_id, name, created_at, last_foreign_pull_at, expiry_warned_at, final_warned_at
               FROM cloud_instances WHERE status = ?`,
            ['active']
        );

        for (const row of active) {
            result.examined += 1;
            const age = ageDays(row, now);

            if (age >= EXPIRY_DAYS) {
                await trashInstance(row, dryRun);
                await notify(row.user_id, trashedText(row), 'warning', dryRun);
                result.trashed += 1;
                continue;
            }

            if (age >= EXPIRY_FINAL_WARN_DAYS && !row.final_warned_at) {
                const remaining = EXPIRY_DAYS - age;
                await notify(row.user_id, warnText(row, remaining), 'warning', dryRun);
                if (await sendExpiryEmail(row.user_id, row, remaining)) result.emails += 1;
                if (!dryRun) {
                    await pool.query('UPDATE cloud_instances SET final_warned_at = NOW() WHERE id = ?', [row.id]);
                }
                result.finalWarned += 1;
                continue;
            }

            if (age >= EXPIRY_WARN_DAYS && !row.expiry_warned_at) {
                await notify(row.user_id, warnText(row, EXPIRY_DAYS - age), 'info', dryRun);
                if (!dryRun) {
                    await pool.query('UPDATE cloud_instances SET expiry_warned_at = NOW() WHERE id = ?', [row.id]);
                }
                result.warned += 1;
            }
        }

        const [trashed] = await pool.query(
            `SELECT id, user_id, name FROM cloud_instances
              WHERE status = ? AND trashed_at < NOW() - INTERVAL '${TRASH_RETENTION_DAYS} days'`,
            ['trashed']
        );

        for (const row of trashed) {
            result.revisionsRemoved += await purgeInstance(row, dryRun);
            result.purged += 1;
        }

        return record({ ...result, durationMs: Date.now() - started });
    } catch (err) {
        console.error('[LuxCloud Expiry] Run failed:', err);
        return record({ ...result, error: err.message, durationMs: Date.now() - started });
    } finally {
        running = false;
    }
}

function getExpiryStatus() {
    return {
        running,
        dryRun: DRY_RUN_DEFAULT,
        policy: {
            expiryDays: EXPIRY_DAYS,
            warnDays: EXPIRY_WARN_DAYS,
            finalWarnDays: EXPIRY_FINAL_WARN_DAYS,
            trashRetentionDays: TRASH_RETENTION_DAYS,
            rule: 'The countdown only resets when a device other than the one that uploaded the '
                + 'current revision pulls the instance.'
        },
        history
    };
}

function startExpiryJob() {
    const cron = require('node-cron');

    cron.schedule('7 5 * * *', () => {
        runExpiry().catch((err) => console.error('[LuxCloud Expiry] Scheduled run failed:', err));
    });

    console.log(`[LuxCloud] Expiry scheduled (daily), dryRun=${DRY_RUN_DEFAULT}, expiryDays=${EXPIRY_DAYS}`);
}

module.exports = {
    ageDays,
    getExpiryStatus,
    runExpiry,
    startExpiryJob
};
