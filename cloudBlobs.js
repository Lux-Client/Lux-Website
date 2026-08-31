const pool = require('./database');
const { blobKey } = require('./storage');

const GC_GRACE_HOURS = Number(process.env.LUXCLOUD_GC_GRACE_HOURS || 24);
const UPLOAD_CLAIM_HOURS = Number(process.env.LUXCLOUD_UPLOAD_CLAIM_HOURS || 24);
const CHUNK = 500;

function chunked(items) {
    const out = [];
    for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
    return out;
}

function placeholders(count) {
    return new Array(count).fill('?').join(', ');
}

async function registerBlob({ hash, size, storedSize, compression }, executor = pool) {
    const [existing] = await executor.query('SELECT hash FROM blobs WHERE hash = ?', [hash]);

    if (existing.length > 0) {
        await executor.query('UPDATE blobs SET last_referenced_at = NOW() WHERE hash = ?', [hash]);
        await executor.query('DELETE FROM blob_gc_queue WHERE blob_hash = ?', [hash]);
        return { inserted: false };
    }

    await executor.query(
        `INSERT INTO blobs (hash, size, stored_size, compression, storage_key)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (hash) DO NOTHING
         RETURNING hash`,
        [hash, size, storedSize, compression, blobKey(hash)]
    );
    await executor.query('DELETE FROM blob_gc_queue WHERE blob_hash = ?', [hash]);
    return { inserted: true };
}

async function getBlob(hash, executor = pool) {
    const [rows] = await executor.query('SELECT * FROM blobs WHERE hash = ?', [hash]);
    return rows[0] || null;
}

async function claimUpload(hash, userId, deviceId, executor = pool) {
    await executor.query(
        `INSERT INTO blob_upload_claims (blob_hash, user_id, device_id, created_at)
         VALUES (?, ?, ?, NOW())
         ON CONFLICT (blob_hash, user_id) DO UPDATE SET created_at = NOW(), device_id = ?
         RETURNING blob_hash`,
        [hash, userId, deviceId, deviceId]
    );
}

async function hasFreshClaim(hash, userId, executor = pool) {
    const [rows] = await executor.query(
        `SELECT 1 AS ok FROM blob_upload_claims
          WHERE blob_hash = ? AND user_id = ?
            AND created_at > NOW() - INTERVAL '${UPLOAD_CLAIM_HOURS} hours'`,
        [hash, userId]
    );
    return rows.length > 0;
}

async function isReferencedByUser(hash, userId, executor = pool) {
    const [rows] = await executor.query(
        `SELECT 1 AS ok
           FROM blob_refs br
           JOIN cloud_revisions r ON r.id = br.revision_id
           JOIN cloud_instances i ON i.id = r.instance_id
          WHERE br.blob_hash = ? AND i.user_id = ?
          LIMIT 1`,
        [hash, userId]
    );
    return rows.length > 0;
}

async function userMayReadBlob(hash, userId, executor = pool) {
    if (await isReferencedByUser(hash, userId, executor)) return true;
    return hasFreshClaim(hash, userId, executor);
}

async function addRefs(revisionId, hashes, executor = pool) {
    const unique = [...new Set(hashes)];
    let added = 0;

    for (const batch of chunked(unique)) {
        const [existing] = await executor.query(
            `SELECT blob_hash FROM blob_refs
              WHERE revision_id = ? AND blob_hash IN (${placeholders(batch.length)})`,
            [revisionId, ...batch]
        );
        const known = new Set(existing.map((row) => row.blob_hash));
        const missing = batch.filter((hash) => !known.has(hash));
        if (missing.length === 0) continue;

        const values = missing.map(() => '(?, ?)').join(', ');
        const params = [];
        for (const hash of missing) params.push(revisionId, hash);

        await executor.query(
            `INSERT INTO blob_refs (revision_id, blob_hash) VALUES ${values}
             ON CONFLICT (revision_id, blob_hash) DO NOTHING
             RETURNING blob_hash`,
            params
        );

        await executor.query(
            `UPDATE blobs SET refcount = refcount + 1, last_referenced_at = NOW()
              WHERE hash IN (${placeholders(missing.length)})`,
            missing
        );
        await executor.query(
            `DELETE FROM blob_gc_queue WHERE blob_hash IN (${placeholders(missing.length)})`,
            missing
        );

        added += missing.length;
    }

    return { added };
}

async function enqueueOrphans(hashes, executor = pool) {
    const unique = [...new Set(hashes)];
    let queued = 0;

    for (const batch of chunked(unique)) {
        const [rows] = await executor.query(
            `SELECT hash FROM blobs WHERE refcount <= 0 AND hash IN (${placeholders(batch.length)})`,
            batch
        );
        for (const row of rows) {
            await executor.query(
                `INSERT INTO blob_gc_queue (blob_hash, eligible_at)
                 VALUES (?, NOW() + INTERVAL '${GC_GRACE_HOURS} hours')
                 ON CONFLICT (blob_hash) DO NOTHING
                 RETURNING blob_hash`,
                [row.hash]
            );
            queued += 1;
        }
    }

    return { queued };
}

async function removeRefsForRevision(revisionId, executor = pool) {
    const [refRows] = await executor.query(
        'SELECT blob_hash FROM blob_refs WHERE revision_id = ?',
        [revisionId]
    );
    const hashes = refRows.map((row) => row.blob_hash);
    if (hashes.length === 0) return { removed: 0, queued: 0 };

    await executor.query('DELETE FROM blob_refs WHERE revision_id = ?', [revisionId]);

    for (const batch of chunked(hashes)) {
        await executor.query(
            `UPDATE blobs SET refcount = GREATEST(refcount - 1, 0)
              WHERE hash IN (${placeholders(batch.length)})`,
            batch
        );
    }

    const { queued } = await enqueueOrphans(hashes, executor);
    return { removed: hashes.length, queued };
}

async function pruneUploadClaims(executor = pool) {
    const [result] = await executor.query(
        `DELETE FROM blob_upload_claims WHERE created_at < NOW() - INTERVAL '${UPLOAD_CLAIM_HOURS} hours'`
    );
    return { deleted: result ? result.affectedRows : 0 };
}

module.exports = {
    GC_GRACE_HOURS,
    UPLOAD_CLAIM_HOURS,
    addRefs,
    claimUpload,
    enqueueOrphans,
    getBlob,
    hasFreshClaim,
    isReferencedByUser,
    pruneUploadClaims,
    registerBlob,
    removeRefsForRevision,
    userMayReadBlob
};
