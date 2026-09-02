const path = require('path');

let cached = null;

function blobKey(hash) {
    return `blobs/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}`;
}

function manifestKey(hash) {
    return `manifests/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}`;
}

function buildStorage() {
    const driver = (process.env.LUXCLOUD_STORAGE_DRIVER || 'fs').toLowerCase();

    if (driver === 's3') {
        const { createS3Storage } = require('./s3');
        return createS3Storage({
            bucket: process.env.LUXCLOUD_S3_BUCKET,
            endpoint: process.env.LUXCLOUD_S3_ENDPOINT,
            region: process.env.LUXCLOUD_S3_REGION,
            accessKeyId: process.env.LUXCLOUD_S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.LUXCLOUD_S3_SECRET_ACCESS_KEY,
            forcePathStyle: String(process.env.LUXCLOUD_S3_FORCE_PATH_STYLE || '').toLowerCase() === 'true'
        });
    }

    if (driver !== 'fs') {
        throw new Error(`Unknown LUXCLOUD_STORAGE_DRIVER: ${driver}`);
    }

    const { createFsStorage } = require('./fs');
    const dataDir = process.env.DATA_DIR || path.resolve(__dirname, '..', 'data');
    return createFsStorage({
        root: process.env.LUXCLOUD_FS_ROOT || path.join(dataDir, 'luxcloud-blobs')
    });
}

function getStorage() {
    if (!cached) cached = buildStorage();
    return cached;
}

function resetStorage() {
    cached = null;
}

module.exports = { blobKey, getStorage, manifestKey, resetStorage };
