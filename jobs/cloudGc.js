const pool = require('../database');
const { getStorage } = require('../storage');
const { pruneUploadClaims } = require('../cloudBlobs');

const GC_BATCH = Number(process.env.LUXCLOUD_GC_BATCH || 1000);
const ORPHAN_OBJECT_DAYS = Number(process.env.LUXCLOUD_ORPHAN_OBJECT_DAYS || 7);
const DRY_RUN_DEFAULT = String(process.env.LUXCLOUD_GC_DRY_RUN || '').toLowerCase() === 'true';

const PAGE = 500;
const HISTORY_LIMIT = 20;

const history = [];
let running = false;

function placeholders(count) {
    return new Array(count).fill('?').join(', ');
}

function record(entry) {
    history.unshift({ ...entry, finishedAt: new Date().toISOString() });
    history.splice(HISTORY_LIMIT);
    return entry;
}

async function runGc({ dryRun = DRY_RUN_DEFAULT, limit = GC_BATCH } = {}) {
    if (running) return { skipped: true, reason: 'already_running' };
    running = true;

    const started = Date.now();
    const result = { job: 'gc', dryRun, examined: 0, deleted: 0, revived: 0, failed: 0, bytesFreed: 0 };

    try {
        const [candidates] = await pool.query(
            `SELECT blob_hash FROM blob_gc_queue
              WHERE eligible_at < NOW()
              ORDER BY eligible_at ASC
              LIMIT ?`,
            [limit]
        );

        const storage = getStorage();

        for (const candidate of candidates) {
            const hash = candidate.blob_hash;
            result.examined += 1;

            const [rows] = await pool.query(
                'SELECT hash, refcount, storage_key, stored_size FROM blobs WHERE hash = ?',
                [hash]
            );
            const blob = rows[0];

            if (!blob) {
                if (!dryRun) await pool.query('DELETE FROM blob_gc_queue WHERE blob_hash = ?', [hash]);
                continue;
            }

            if (Number(blob.refcount) > 0) {
                result.revived += 1;
                if (!dryRun) await pool.query('DELETE FROM blob_gc_queue WHERE blob_hash = ?', [hash]);
                continue;
            }

            if (dryRun) {
                result.deleted += 1;
                result.bytesFreed += Number(blob.stored_size || 0);
                continue;
            }

            try {
                await storage.remove([blob.storage_key]);
                await pool.query('DELETE FROM blobs WHERE hash = ? AND refcount <= 0', [hash]);
                await pool.query('DELETE FROM blob_gc_queue WHERE blob_hash = ?', [hash]);
                result.deleted += 1;
                result.bytesFreed += Number(blob.stored_size || 0);
            } catch (err) {
                result.failed += 1;
                await pool.query(
                    'UPDATE blob_gc_queue SET attempts = attempts + 1, eligible_at = NOW() + INTERVAL \'1 hour\' WHERE blob_hash = ?',
                    [hash]
                );
                console.error(`[LuxCloud GC] Could not delete ${hash}:`, err.message);
            }
        }

        const claims = await pruneUploadClaims();
        result.prunedUploadClaims = claims.deleted;
    } finally {
        running = false;
    }

    result.durationMs = Date.now() - started;
    return record(result);
}

async function reconcileRefcounts({ dryRun }) {
    const fixed = [];
    let lastHash = '';

    for (;;) {
        const [blobs] = await pool.query(
            `SELECT hash, refcount FROM blobs WHERE hash > ? ORDER BY hash ASC LIMIT ?`,
            [lastHash, PAGE]
        );
        if (blobs.length === 0) break;
        lastHash = blobs[blobs.length - 1].hash;

        const hashes = blobs.map((row) => row.hash);
        const [counts] = await pool.query(
            `SELECT blob_hash, COUNT(*) AS cnt FROM blob_refs
              WHERE blob_hash IN (${placeholders(hashes.length)})
              GROUP BY blob_hash`,
            hashes
        );
        const actual = new Map(counts.map((row) => [row.blob_hash, Number(row.cnt)]));

        for (const blob of blobs) {
            const real = actual.get(blob.hash) || 0;
            if (Number(blob.refcount) === real) continue;

            fixed.push({ hash: blob.hash, was: Number(blob.refcount), now: real });
            if (dryRun) continue;

            await pool.query('UPDATE blobs SET refcount = ? WHERE hash = ?', [real, blob.hash]);
            if (real === 0) {
                await pool.query(
                    `INSERT INTO blob_gc_queue (blob_hash, eligible_at)
                     VALUES (?, NOW() + INTERVAL '24 hours')
                     ON CONFLICT (blob_hash) DO NOTHING
                     RETURNING blob_hash`,
                    [blob.hash]
                );
            } else {
                await pool.query('DELETE FROM blob_gc_queue WHERE blob_hash = ?', [blob.hash]);
            }
        }
    }

    return fixed;
}

async function findOrphanObjects({ dryRun }) {
    const storage = getStorage();
    const cutoff = Date.now() - ORPHAN_OBJECT_DAYS * 24 * 60 * 60 * 1000;

    const objects = await storage.list('blobs/');
    const stale = objects.filter((entry) => {
        const modified = entry.lastModified ? new Date(entry.lastModified).getTime() : 0;
        return modified > 0 && modified < cutoff;
    });

    const orphans = [];
    for (let i = 0; i < stale.length; i += PAGE) {
        const batch = stale.slice(i, i + PAGE);
        const keys = batch.map((entry) => entry.key);
        const [known] = await pool.query(
            `SELECT storage_key FROM blobs WHERE storage_key IN (${placeholders(keys.length)})`,
            keys
        );
        const knownKeys = new Set(known.map((row) => row.storage_key));
        for (const entry of batch) {
            if (!knownKeys.has(entry.key)) orphans.push(entry);
        }
    }

    if (!dryRun && orphans.length > 0) {
        await storage.remove(orphans.map((entry) => entry.key));
    }
    return orphans;
}

async function runReconcile({ dryRun = DRY_RUN_DEFAULT } = {}) {
    const started = Date.now();
    const fixed = await reconcileRefcounts({ dryRun });
    const orphans = await findOrphanObjects({ dryRun });

    return record({
        job: 'reconcile',
        dryRun,
        refcountsFixed: fixed.length,
        refcountSamples: fixed.slice(0, 20),
        orphanObjects: orphans.length,
        orphanBytes: orphans.reduce((sum, entry) => sum + Number(entry.size || 0), 0),
        durationMs: Date.now() - started
    });
}

async function getGcStatus() {
    const [queue] = await pool.query('SELECT COUNT(*) AS count FROM blob_gc_queue');
    const [due] = await pool.query('SELECT COUNT(*) AS count FROM blob_gc_queue WHERE eligible_at < NOW()');
    const [blobs] = await pool.query(
        `SELECT COUNT(*) AS count,
                COALESCE(SUM(size), 0) AS logical_bytes,
                COALESCE(SUM(stored_size), 0) AS stored_bytes
           FROM blobs`
    );
    const [orphaned] = await pool.query('SELECT COUNT(*) AS count FROM blobs WHERE refcount <= 0');

    return {
        dryRun: DRY_RUN_DEFAULT,
        running,
        driver: getStorage().driver,
        queue: {
            total: Number(queue[0].count),
            due: Number(due[0].count)
        },
        blobs: {
            count: Number(blobs[0].count),
            logicalBytes: Number(blobs[0].logical_bytes),
            storedBytes: Number(blobs[0].stored_bytes),
            unreferenced: Number(orphaned[0].count)
        },
        history
    };
}

function startCloudJobs() {
    const cron = require('node-cron');

    cron.schedule('17 * * * *', () => {
        runGc().catch((err) => console.error('[LuxCloud GC] Scheduled run failed:', err));
    });

    cron.schedule('41 3 * * 0', () => {
        runReconcile().catch((err) => console.error('[LuxCloud GC] Reconcile failed:', err));
    });

    console.log(`[LuxCloud] GC scheduled (hourly), reconcile scheduled (weekly), dryRun=${DRY_RUN_DEFAULT}`);
}

module.exports = { getGcStatus, runGc, runReconcile, startCloudJobs };
