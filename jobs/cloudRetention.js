const pool = require('../database');
const { getStorage, blobKey } = require('../storage');
const { removeRefsForRevision, enqueueOrphans } = require('../cloudBlobs');
const { validateManifest } = require('../routes/manifestSchema');
const { recalcUsedBytes } = require('../cloudInstances');
const { TRASH_RETENTION_DAYS } = require('../cloudConfig');

const KEEP_ALL_DAYS = Number(process.env.LUXCLOUD_KEEP_ALL_DAYS || 7);
const KEEP_DAILY_DAYS = Number(process.env.LUXCLOUD_KEEP_DAILY_DAYS || 30);
const KEEP_MONTHLY_DAYS = Number(process.env.LUXCLOUD_KEEP_MONTHLY_DAYS || 90);
const MAX_REVISIONS = Number(process.env.LUXCLOUD_MAX_REVISIONS || 20);
const KEEP_WORLDS_REVISIONS = Number(process.env.LUXCLOUD_KEEP_WORLDS_REVISIONS || 3);
const DRY_RUN_DEFAULT = String(process.env.LUXCLOUD_GC_DRY_RUN || '').toLowerCase() === 'true';

const HISTORY_LIMIT = 20;
const history = [];
let running = false;

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(date) {
    return new Date(date).toISOString().slice(0, 10);
}

function monthKey(date) {
    return new Date(date).toISOString().slice(0, 7);
}

function selectRevisionsToDrop(revisions, now = Date.now()) {
    const sorted = [...revisions].sort((a, b) => Number(b.revision) - Number(a.revision));
    const keep = new Set();
    const seenDays = new Set();
    const seenMonths = new Set();

    for (const row of sorted) {
        const age = now - new Date(row.created_at).getTime();

        if (Number(row.revision) === Number(row.current_revision)) {
            keep.add(row.id);
            continue;
        }
        if (row.keep_until && new Date(row.keep_until).getTime() > now) {
            keep.add(row.id);
            continue;
        }

        if (age <= KEEP_ALL_DAYS * DAY_MS) {
            keep.add(row.id);
            continue;
        }
        if (age <= KEEP_DAILY_DAYS * DAY_MS) {
            const key = dayKey(row.created_at);
            if (!seenDays.has(key)) {
                seenDays.add(key);
                keep.add(row.id);
            }
            continue;
        }
        if (age <= KEEP_MONTHLY_DAYS * DAY_MS) {
            const key = monthKey(row.created_at);
            if (!seenMonths.has(key)) {
                seenMonths.add(key);
                keep.add(row.id);
            }
        }
    }

    const kept = sorted.filter((row) => keep.has(row.id));
    const overflow = kept.slice(MAX_REVISIONS);
    for (const row of overflow) {
        if (Number(row.revision) === Number(row.current_revision)) continue;
        keep.delete(row.id);
    }

    return sorted.filter((row) => !keep.has(row.id));
}

async function loadManifestBlobs(manifestHash) {
    const [rows] = await pool.query('SELECT storage_key FROM blobs WHERE hash = ?', [manifestHash]);
    if (rows.length === 0) return null;

    try {
        const { stream } = await getStorage().get(rows[0].storage_key || blobKey(manifestHash));
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);

        const manifest = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const validation = validateManifest(manifest);
        if (!validation.valid) return null;

        const worldBlobs = new Set();
        for (const entry of manifest.entries) {
            if (!String(entry.path || '').startsWith('saves/')) continue;
            if (entry.blob) worldBlobs.add(entry.blob);
            if (entry.chunks && entry.chunks.list) worldBlobs.add(entry.chunks.list);
        }

        return { manifest, blobHashes: validation.stats.blobHashes, worldBlobs: [...worldBlobs] };
    } catch (_) {
        return null;
    }
}

async function degradeWorlds({ dryRun }) {
    const result = { examined: 0, degraded: 0, refsRemoved: 0 };

    const [rows] = await pool.query(
        `SELECT r.id, r.instance_id, r.revision, r.manifest_blob, i.current_revision
           FROM cloud_revisions r
           JOIN cloud_instances i ON i.id = r.instance_id
          WHERE r.has_worlds = TRUE
          ORDER BY r.instance_id, r.revision`
    );

    const candidates = rows.filter(
        (row) => Number(row.revision) <= Number(row.current_revision) - KEEP_WORLDS_REVISIONS
    );

    for (const row of candidates) {
        result.examined += 1;

        const loaded = await loadManifestBlobs(row.manifest_blob);
        if (!loaded || loaded.worldBlobs.length === 0) continue;

        if (dryRun) {
            result.degraded += 1;
            result.refsRemoved += loaded.worldBlobs.length;
            continue;
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const inList = loaded.worldBlobs.map(() => '?').join(', ');
            const [existing] = await connection.query(
                `SELECT blob_hash FROM blob_refs WHERE revision_id = ? AND blob_hash IN (${inList})`,
                [row.id, ...loaded.worldBlobs]
            );
            const present = existing.map((entry) => entry.blob_hash);

            if (present.length > 0) {
                const presentList = present.map(() => '?').join(', ');
                await connection.query(
                    `DELETE FROM blob_refs WHERE revision_id = ? AND blob_hash IN (${presentList})`,
                    [row.id, ...present]
                );
                await connection.query(
                    `UPDATE blobs SET refcount = GREATEST(refcount - 1, 0) WHERE hash IN (${presentList})`,
                    present
                );
            }

            await connection.query('UPDATE cloud_revisions SET has_worlds = FALSE WHERE id = ?', [row.id]);
            await connection.commit();

            if (present.length > 0) await enqueueOrphans(present);

            result.degraded += 1;
            result.refsRemoved += present.length;
        } catch (err) {
            await connection.rollback().catch(() => {});
            console.error(`[LuxCloud Retention] Could not degrade revision ${row.id}:`, err.message);
        } finally {
            connection.release();
        }
    }

    return result;
}

async function pruneRevisions({ dryRun }) {
    const result = { instances: 0, dropped: 0, refsRemoved: 0 };

    const [instances] = await pool.query(
        'SELECT id, user_id, current_revision FROM cloud_instances WHERE status = ?',
        ['active']
    );

    for (const instance of instances) {
        const [revisions] = await pool.query(
            `SELECT id, revision, created_at, keep_until, has_worlds
               FROM cloud_revisions WHERE instance_id = ?`,
            [instance.id]
        );
        if (revisions.length <= 1) continue;

        result.instances += 1;

        const withCurrent = revisions.map((row) => ({ ...row, current_revision: instance.current_revision }));
        const drop = selectRevisionsToDrop(withCurrent);

        for (const row of drop) {
            if (dryRun) {
                result.dropped += 1;
                continue;
            }

            const removed = await removeRefsForRevision(row.id);
            await pool.query('DELETE FROM cloud_revisions WHERE id = ?', [row.id]);

            result.dropped += 1;
            result.refsRemoved += removed.removed || 0;
        }
    }

    return result;
}

async function purgeTrash({ dryRun }) {
    const result = { purged: 0, revisionsRemoved: 0 };

    const [rows] = await pool.query(
        `SELECT id, user_id FROM cloud_instances
          WHERE status = ? AND trashed_at < NOW() - INTERVAL '${TRASH_RETENTION_DAYS} days'`,
        ['trashed']
    );

    for (const instance of rows) {
        if (dryRun) {
            result.purged += 1;
            continue;
        }

        const [revisions] = await pool.query(
            'SELECT id FROM cloud_revisions WHERE instance_id = ?',
            [instance.id]
        );
        for (const revision of revisions) {
            await removeRefsForRevision(revision.id);
            result.revisionsRemoved += 1;
        }

        await pool.query('DELETE FROM cloud_instances WHERE id = ?', [instance.id]);
        await recalcUsedBytes(instance.user_id);
        result.purged += 1;
    }

    return result;
}

function record(entry) {
    history.unshift({ ...entry, finishedAt: new Date().toISOString() });
    history.splice(HISTORY_LIMIT);
    return entry;
}

async function runRetention({ dryRun = DRY_RUN_DEFAULT } = {}) {
    if (running) return { skipped: true, reason: 'already_running' };
    running = true;

    const started = Date.now();
    try {
        const worlds = await degradeWorlds({ dryRun });
        const revisions = await pruneRevisions({ dryRun });
        const trash = await purgeTrash({ dryRun });

        return record({
            job: 'retention',
            dryRun,
            worlds,
            revisions,
            trash,
            durationMs: Date.now() - started
        });
    } catch (err) {
        console.error('[LuxCloud Retention] Run failed:', err);
        return record({ job: 'retention', dryRun, error: err.message, durationMs: Date.now() - started });
    } finally {
        running = false;
    }
}

function getRetentionStatus() {
    return {
        running,
        dryRun: DRY_RUN_DEFAULT,
        policy: {
            keepAllDays: KEEP_ALL_DAYS,
            keepDailyDays: KEEP_DAILY_DAYS,
            keepMonthlyDays: KEEP_MONTHLY_DAYS,
            maxRevisions: MAX_REVISIONS,
            keepWorldsRevisions: KEEP_WORLDS_REVISIONS,
            trashRetentionDays: TRASH_RETENTION_DAYS
        },
        history
    };
}

function startRetentionJob() {
    const cron = require('node-cron');

    cron.schedule('23 4 * * *', () => {
        runRetention().catch((err) => console.error('[LuxCloud Retention] Scheduled run failed:', err));
    });

    console.log(`[LuxCloud] Retention scheduled (daily), dryRun=${DRY_RUN_DEFAULT}`);
}

module.exports = {
    KEEP_WORLDS_REVISIONS,
    MAX_REVISIONS,
    getRetentionStatus,
    pruneRevisions,
    purgeTrash,
    degradeWorlds,
    runRetention,
    selectRevisionsToDrop,
    startRetentionJob
};
