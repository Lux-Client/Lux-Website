const express = require('express');
const crypto = require('crypto');
const { Readable } = require('stream');
const pool = require('../database');
const { cloudError, ensureCloudSettingsRow, ensureDeviceAuth } = require('../middleware/deviceAuth');
const { INSTANCE_UUID_RE, SHA256_RE, MAX_BLOB_BYTES } = require('../cloudConfig');
const { getStorage, blobKey } = require('../storage');
const { validateManifest, MAX_ENTRIES } = require('./manifestSchema');
const {
    INSTANCE_COLUMNS,
    decorate,
    ownedInstance,
    readQuota,
    recalcUsedBytes,
    serializeInstance
} = require('../cloudInstances');
const {
    addRefs,
    getBlob,
    hasFreshClaim,
    isReferencedByUser,
    registerBlob
} = require('../cloudBlobs');

const router = express.Router();

const MAX_NEGOTIATE_ENTRIES = MAX_ENTRIES + 1000;

function quotaPayload(quota, extra = {}) {
    return {
        usedBytes: quota.usedBytes,
        quotaBytes: quota.quotaBytes,
        availableBytes: Math.max(quota.quotaBytes - quota.usedBytes, 0),
        ...extra
    };
}

async function requireInstance(req, res, { executor = pool } = {}) {
    if (!INSTANCE_UUID_RE.test(String(req.params.uuid))) {
        cloudError(res, 404, 'not_found', 'Instance not found');
        return null;
    }

    const instance = await ownedInstance(req.cloudUserId, String(req.params.uuid), { executor });
    if (!instance) {
        cloudError(res, 404, 'not_found', 'Instance not found');
        return null;
    }
    return instance;
}

router.post('/instances/:uuid/negotiate', ensureDeviceAuth, async (req, res) => {
    const body = req.body || {};
    const entries = Array.isArray(body.blobs) ? body.blobs : null;

    if (!entries) {
        return cloudError(res, 400, 'invalid_request', 'blobs must be an array');
    }
    if (entries.length > MAX_NEGOTIATE_ENTRIES) {
        return cloudError(res, 400, 'invalid_request', `too many blobs (max ${MAX_NEGOTIATE_ENTRIES})`);
    }

    const wanted = new Map();
    for (const entry of entries) {
        const hash = entry && typeof entry.hash === 'string' ? entry.hash : '';
        if (!SHA256_RE.test(hash)) {
            return cloudError(res, 400, 'invalid_request', 'blob hash must be a lowercase hex digest');
        }
        const size = Number(entry.size);
        if (!Number.isSafeInteger(size) || size < 0 || size > MAX_BLOB_BYTES) {
            return cloudError(res, 400, 'invalid_request', 'blob size out of range');
        }
        wanted.set(hash, size);
    }

    try {
        await ensureCloudSettingsRow(req.cloudUserId);

        const instance = await requireInstance(req, res);
        if (!instance) return null;

        const hashes = [...wanted.keys()];
        const known = [];

        for (let i = 0; i < hashes.length; i += 500) {
            const batch = hashes.slice(i, i + 500);
            const placeholders = batch.map(() => '?').join(', ');
            const [rows] = await pool.query(
                `SELECT hash FROM blobs WHERE hash IN (${placeholders})`,
                batch
            );
            for (const row of rows) known.push(row.hash);
        }

        const knownSet = new Set(known);
        const missing = hashes.filter((hash) => !knownSet.has(hash));

        const quota = await readQuota(req.cloudUserId);
        const projected = Number(body.projectedBytes);
        const instanceBytes = Number(instance.logical_bytes || 0);
        const nextUsed = Number.isSafeInteger(projected) && projected >= 0
            ? quota.usedBytes - instanceBytes + projected
            : quota.usedBytes;
        const wouldExceed = quota.quotaBytes > 0 && nextUsed > quota.quotaBytes;

        if (wouldExceed) {
            return cloudError(res, 413, 'quota_exceeded', 'Not enough cloud storage', {
                details: quotaPayload(quota, {
                    neededBytes: nextUsed - quota.quotaBytes,
                    projectedBytes: projected
                })
            });
        }

        return res.json({
            missing,
            known,
            missingBytes: missing.reduce((sum, hash) => sum + (wanted.get(hash) || 0), 0),
            quota: quotaPayload(quota, { wouldExceed: false })
        });
    } catch (err) {
        console.error('[LuxCloud] POST /negotiate failed:', err);
        return cloudError(res, 500, 'server_error', 'Could not negotiate upload');
    }
});

async function assertBlobsUsable(hashes, userId, executor) {
    const missing = [];
    const forbidden = [];

    for (const hash of hashes) {
        const blob = await getBlob(hash, executor);
        if (!blob) {
            missing.push(hash);
            continue;
        }
        if (await isReferencedByUser(hash, userId, executor)) continue;
        if (await hasFreshClaim(hash, userId, executor)) continue;
        forbidden.push(hash);
    }

    return { missing, forbidden };
}

router.post('/instances/:uuid/commit', ensureDeviceAuth, async (req, res) => {
    const body = req.body || {};
    const manifest = body.manifest;
    const parentRevision = Number(body.parentRevision);

    if (!Number.isSafeInteger(parentRevision) || parentRevision < 0) {
        return cloudError(res, 400, 'invalid_request', 'parentRevision must be a non-negative integer');
    }

    const validation = validateManifest(manifest);
    if (!validation.valid) {
        return cloudError(res, 422, 'invalid_manifest', 'Manifest failed validation', {
            details: { issues: validation.issues.slice(0, 50) }
        });
    }
    if (String(manifest.instanceId) !== String(req.params.uuid)) {
        return cloudError(res, 422, 'invalid_manifest', 'Manifest does not belong to this instance');
    }

    const serialized = Buffer.from(JSON.stringify(manifest), 'utf8');
    const manifestHash = crypto.createHash('sha256').update(serialized).digest('hex');

    if (serialized.length > MAX_BLOB_BYTES) {
        return cloudError(res, 413, 'blob_too_large', 'Manifest is too large');
    }

    let storagePut = false;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();
        await ensureCloudSettingsRow(req.cloudUserId, connection);

        const [lockRows] = await connection.query(
            `SELECT ${INSTANCE_COLUMNS} FROM cloud_instances i
              WHERE i.user_id = ? AND i.instance_uuid = ? AND i.status = ?
              FOR UPDATE`,
            [req.cloudUserId, String(req.params.uuid), 'active']
        );
        if (lockRows.length === 0) {
            await connection.rollback();
            return cloudError(res, 404, 'not_found', 'Instance not found');
        }
        const [instance] = await decorate(lockRows, connection);
        const currentRevision = Number(instance.current_revision);

        if (parentRevision !== currentRevision) {
            await connection.rollback();
            return cloudError(res, 409, 'revision_conflict', 'The cloud has a newer revision', {
                details: {
                    currentRevision,
                    currentManifestHash: instance.manifest_hash || null
                }
            });
        }

        const blobHashes = validation.stats.blobHashes;
        const { missing, forbidden } = await assertBlobsUsable(blobHashes, req.cloudUserId, connection);

        if (missing.length > 0) {
            await connection.rollback();
            return cloudError(res, 422, 'missing_blobs', 'Some referenced blobs were never uploaded', {
                details: { missing: missing.slice(0, 50), missingCount: missing.length }
            });
        }
        if (forbidden.length > 0) {
            await connection.rollback();
            return cloudError(res, 403, 'forbidden', 'Manifest references blobs that do not belong to you', {
                details: { forbiddenCount: forbidden.length }
            });
        }

        const [quotaRows] = await connection.query(
            'SELECT quota_bytes, used_bytes FROM user_cloud_settings WHERE user_id = ? FOR UPDATE',
            [req.cloudUserId]
        );
        const quotaBytes = Number(quotaRows[0] ? quotaRows[0].quota_bytes : 0);
        const usedBytes = Number(quotaRows[0] ? quotaRows[0].used_bytes : 0);
        const logicalBytes = Number(validation.stats.logicalBytes) + serialized.length;
        const nextUsed = usedBytes - Number(instance.logical_bytes || 0) + logicalBytes;

        if (quotaBytes > 0 && nextUsed > quotaBytes) {
            await connection.rollback();
            return cloudError(res, 413, 'quota_exceeded', 'Not enough cloud storage', {
                details: {
                    usedBytes,
                    quotaBytes,
                    availableBytes: Math.max(quotaBytes - usedBytes, 0),
                    neededBytes: nextUsed - quotaBytes
                }
            });
        }

        if (!await getBlob(manifestHash, connection)) {
            await getStorage().put(blobKey(manifestHash), Readable.from(serialized), {
                contentLength: serialized.length
            });
            storagePut = true;
        }
        await registerBlob({
            hash: manifestHash,
            size: serialized.length,
            storedSize: serialized.length,
            compression: 'none'
        }, connection);

        const revision = currentRevision + 1;

        const [inserted] = await connection.query(
            `INSERT INTO cloud_revisions
                (instance_id, revision, parent_revision, manifest_blob, device_id,
                 entry_count, logical_bytes, has_worlds)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                instance.id,
                revision,
                currentRevision > 0 ? currentRevision : null,
                manifestHash,
                req.device.id,
                validation.stats.entryCount,
                logicalBytes,
                validation.stats.hasWorlds
            ]
        );

        const revisionId = inserted.insertId;
        await addRefs(revisionId, [...blobHashes, manifestHash], connection);

        const runtime = manifest.runtime || {};
        await connection.query(
            `UPDATE cloud_instances
                SET current_revision = ?, logical_bytes = ?, name = ?,
                    mc_version = ?, loader = ?, loader_version = ?, icon_blob = ?,
                    last_touched_at = NOW(), updated_at = NOW()
              WHERE id = ?`,
            [
                revision,
                logicalBytes,
                String(manifest.name),
                runtime.mcVersion ? String(runtime.mcVersion) : instance.mc_version,
                runtime.loader ? String(runtime.loader) : instance.loader,
                runtime.loaderVersion ? String(runtime.loaderVersion) : instance.loader_version,
                manifest.icon && manifest.icon.blob ? manifest.icon.blob : null,
                instance.id
            ]
        );

        await recalcUsedBytes(req.cloudUserId, connection);
        const quota = await readQuota(req.cloudUserId, connection);
        const updated = await ownedInstance(req.cloudUserId, String(req.params.uuid), { executor: connection });

        await connection.commit();

        return res.status(201).json({
            revision,
            manifestHash,
            instance: serializeInstance(updated),
            quota: quotaPayload(quota)
        });
    } catch (err) {
        await connection.rollback().catch(() => {});
        if (storagePut) {
            console.error(`[LuxCloud] commit rolled back after storing manifest ${manifestHash}; GC will reclaim it`);
        }
        console.error('[LuxCloud] POST /commit failed:', err);
        return cloudError(res, 500, 'server_error', 'Could not commit revision');
    } finally {
        connection.release();
    }
});

async function readManifestBlob(hash) {
    const { stream } = await getStorage().get(blobKey(hash));
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

router.get('/instances/:uuid/manifest', ensureDeviceAuth, async (req, res) => {
    try {
        const instance = await requireInstance(req, res);
        if (!instance) return null;

        const raw = String(req.query.revision || 'latest');
        let revision;

        if (raw === 'latest') {
            revision = Number(instance.current_revision);
        } else {
            revision = Number(raw);
            if (!Number.isSafeInteger(revision) || revision < 1) {
                return cloudError(res, 400, 'invalid_request', 'revision must be latest or a positive integer');
            }
        }

        if (revision < 1) {
            return cloudError(res, 404, 'not_found', 'This instance has no revision yet');
        }

        const [rows] = await pool.query(
            `SELECT id, revision, parent_revision, manifest_blob, entry_count,
                    logical_bytes, has_worlds, created_at
               FROM cloud_revisions WHERE instance_id = ? AND revision = ?`,
            [instance.id, revision]
        );
        const row = rows[0];
        if (!row) return cloudError(res, 404, 'not_found', 'Revision not found');

        let manifest;
        try {
            manifest = JSON.parse((await readManifestBlob(row.manifest_blob)).toString('utf8'));
        } catch (err) {
            console.error(`[LuxCloud] manifest blob ${row.manifest_blob} unreadable:`, err.message);
            return cloudError(res, 500, 'server_error', 'Manifest could not be read');
        }

        if (String(req.query.touch) === '1') {
            await pool.query(
                'UPDATE cloud_instances SET last_pulled_at = NOW(), last_touched_at = NOW() WHERE id = ?',
                [instance.id]
            );
        }

        return res.json({
            revision: Number(row.revision),
            parentRevision: row.parent_revision === null ? null : Number(row.parent_revision),
            manifestHash: row.manifest_blob,
            entryCount: Number(row.entry_count),
            logicalBytes: Number(row.logical_bytes),
            hasWorlds: Boolean(row.has_worlds),
            createdAt: row.created_at,
            manifest
        });
    } catch (err) {
        console.error('[LuxCloud] GET /manifest failed:', err);
        return cloudError(res, 500, 'server_error', 'Could not read manifest');
    }
});

router.get('/instances/:uuid/revisions', ensureDeviceAuth, async (req, res) => {
    try {
        const instance = await requireInstance(req, res);
        if (!instance) return null;

        const [rows] = await pool.query(
            `SELECT r.revision, r.parent_revision, r.manifest_blob, r.entry_count,
                    r.logical_bytes, r.has_worlds, r.label, r.keep_until, r.created_at,
                    d.device_uuid, d.name AS device_name
               FROM cloud_revisions r
               LEFT JOIN client_devices d ON d.id = r.device_id
              WHERE r.instance_id = ?
              ORDER BY r.revision DESC
              LIMIT 100`,
            [instance.id]
        );

        return res.json({
            currentRevision: Number(instance.current_revision),
            revisions: rows.map((row) => ({
                revision: Number(row.revision),
                parentRevision: row.parent_revision === null ? null : Number(row.parent_revision),
                manifestHash: row.manifest_blob,
                entryCount: Number(row.entry_count),
                logicalBytes: Number(row.logical_bytes),
                hasWorlds: Boolean(row.has_worlds),
                label: row.label,
                keepUntil: row.keep_until,
                createdAt: row.created_at,
                device: row.device_uuid ? { deviceUuid: row.device_uuid, name: row.device_name } : null
            }))
        });
    } catch (err) {
        console.error('[LuxCloud] GET /revisions failed:', err);
        return cloudError(res, 500, 'server_error', 'Could not list revisions');
    }
});

module.exports = router;
