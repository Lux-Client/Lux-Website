const pool = require('./database');
const { removeRefsForRevision } = require('./cloudBlobs');

async function purgeCloudData(userId, executor = pool) {
    const result = { instances: 0, revisions: 0, blobRefsRemoved: 0, blobsQueued: 0 };

    const [instances] = await executor.query(
        'SELECT id FROM cloud_instances WHERE user_id = ?',
        [userId]
    );

    for (const instance of instances) {
        const [revisions] = await executor.query(
            'SELECT id FROM cloud_revisions WHERE instance_id = ?',
            [instance.id]
        );

        for (const revision of revisions) {
            const removed = await removeRefsForRevision(revision.id, executor);
            result.revisions += 1;
            result.blobRefsRemoved += removed.removed || 0;
            result.blobsQueued += removed.queued || 0;
        }

        await executor.query('DELETE FROM cloud_instances WHERE id = ?', [instance.id]);
        result.instances += 1;
    }

    await executor.query('DELETE FROM blob_upload_claims WHERE user_id = ?', [userId]);
    await executor.query(
        'UPDATE user_cloud_settings SET used_bytes = 0, updated_at = NOW() WHERE user_id = ?',
        [userId]
    );

    return result;
}

async function revokeAllDevices(userId, executor = pool) {
    const [result] = await executor.query(
        `UPDATE client_devices
            SET revoked_at = NOW(), refresh_token_hash = NULL,
                prev_refresh_token_hash = NULL, token_generation = token_generation + 1
          WHERE user_id = ? AND revoked_at IS NULL`,
        [userId]
    );
    return { revoked: result ? result.affectedRows : 0 };
}

async function purgeEverything(userId, executor = pool) {
    const data = await purgeCloudData(userId, executor);
    const devices = await revokeAllDevices(userId, executor);
    await executor.query('DELETE FROM client_devices WHERE user_id = ?', [userId]);
    return { ...data, devicesRevoked: devices.revoked };
}

module.exports = { purgeCloudData, purgeEverything, revokeAllDevices };
