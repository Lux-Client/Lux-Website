const pool = require('./database');
const { expiresAt, purgesAt } = require('./cloudConfig');

const INSTANCE_COLUMNS = `
    i.id, i.instance_uuid, i.name, i.icon_blob, i.mc_version, i.loader, i.loader_version,
    i.current_revision, i.origin_platform, i.cross_platform, i.sync_worlds, i.sync_screenshots,
    i.logical_bytes, i.status, i.last_touched_at, i.last_pulled_at, i.trashed_at,
    i.last_foreign_pull_at, i.last_commit_device_id, i.expiry_warned_at, i.final_warned_at,
    i.created_at, i.updated_at
`;

const PATCHABLE_FIELDS = {
    crossPlatform: 'cross_platform',
    syncWorlds: 'sync_worlds',
    syncScreenshots: 'sync_screenshots'
};

async function attachPlaytime(rows, executor) {
    const ids = rows.map((row) => row.id);
    const placeholders = ids.map(() => '?').join(', ');
    const [playtimeRows] = await executor.query(
        `SELECT instance_id, COALESCE(SUM(total_ms), 0) AS total_ms
           FROM cloud_instance_playtime
          WHERE instance_id IN (${placeholders})
          GROUP BY instance_id`,
        ids
    );
    return new Map(playtimeRows.map((row) => [Number(row.instance_id), Number(row.total_ms)]));
}

async function attachManifestHashes(rows, executor) {
    const withRevision = rows.filter((row) => Number(row.current_revision) > 0);
    if (withRevision.length === 0) return new Map();

    const conditions = withRevision.map(() => '(instance_id = ? AND revision = ?)').join(' OR ');
    const params = [];
    for (const row of withRevision) {
        params.push(row.id, row.current_revision);
    }

    const [revisionRows] = await executor.query(
        `SELECT instance_id, manifest_blob FROM cloud_revisions WHERE ${conditions}`,
        params
    );
    return new Map(revisionRows.map((row) => [Number(row.instance_id), row.manifest_blob]));
}

async function decorate(rows, executor = pool) {
    if (rows.length === 0) return [];

    const [playtime, manifests] = await Promise.all([
        attachPlaytime(rows, executor),
        attachManifestHashes(rows, executor)
    ]);

    return rows.map((row) => ({
        ...row,
        playtime_total_ms: playtime.get(Number(row.id)) || 0,
        manifest_hash: manifests.get(Number(row.id)) || null
    }));
}

function serializeInstance(row) {
    return {
        instanceUuid: row.instance_uuid,
        name: row.name,
        iconBlob: row.icon_blob,
        mcVersion: row.mc_version,
        loader: row.loader,
        loaderVersion: row.loader_version,
        revision: Number(row.current_revision),
        manifestHash: row.manifest_hash || null,
        originPlatform: row.origin_platform,
        crossPlatform: Boolean(row.cross_platform),
        syncWorlds: Boolean(row.sync_worlds),
        syncScreenshots: Boolean(row.sync_screenshots),
        logicalBytes: Number(row.logical_bytes || 0),
        playtimeTotalMs: Number(row.playtime_total_ms || 0),
        status: row.status,
        lastTouchedAt: row.last_touched_at,
        lastPulledAt: row.last_pulled_at,
        trashedAt: row.trashed_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        expiresAt: row.status === 'active' ? expiresAt(row.last_foreign_pull_at || row.created_at) : null,
        purgesAt: row.status === 'trashed' ? purgesAt(row.trashed_at) : null,
        lastForeignPullAt: row.last_foreign_pull_at || null,
        everPulledElsewhere: Boolean(row.last_foreign_pull_at)
    };
}

function expiryBasis(row) {
    return row.last_foreign_pull_at || row.created_at;
}

async function ownedInstance(userId, instanceUuid, { status = 'active', executor = pool } = {}) {
    const params = [userId, String(instanceUuid)];
    let sql = `SELECT ${INSTANCE_COLUMNS} FROM cloud_instances i
                WHERE i.user_id = ? AND i.instance_uuid = ?`;
    if (status !== 'any') {
        sql += ' AND i.status = ?';
        params.push(status);
    }

    const [rows] = await executor.query(sql, params);
    if (rows.length === 0) return null;

    const [decorated] = await decorate(rows, executor);
    return decorated;
}

async function countActiveInstances(userId, executor = pool) {
    const [rows] = await executor.query(
        'SELECT COUNT(*) AS count FROM cloud_instances WHERE user_id = ? AND status = ?',
        [userId, 'active']
    );
    return Number(rows[0] ? rows[0].count : 0);
}

async function recalcUsedBytes(userId, executor = pool) {
    const [rows] = await executor.query(
        'SELECT COALESCE(SUM(logical_bytes), 0) AS total FROM cloud_instances WHERE user_id = ?',
        [userId]
    );
    const total = Number(rows[0] ? rows[0].total : 0);

    await executor.query(
        'UPDATE user_cloud_settings SET used_bytes = ?, updated_at = NOW() WHERE user_id = ?',
        [total, userId]
    );
    return total;
}

async function readQuota(userId, executor = pool) {
    const [rows] = await executor.query(
        'SELECT quota_bytes, max_instances, used_bytes FROM user_cloud_settings WHERE user_id = ?',
        [userId]
    );
    const row = rows[0] || {};
    return {
        quotaBytes: Number(row.quota_bytes || 0),
        maxInstances: Number(row.max_instances || 0),
        usedBytes: Number(row.used_bytes || 0)
    };
}

module.exports = {
    INSTANCE_COLUMNS,
    PATCHABLE_FIELDS,
    countActiveInstances,
    decorate,
    expiryBasis,
    ownedInstance,
    readQuota,
    recalcUsedBytes,
    serializeInstance
};
