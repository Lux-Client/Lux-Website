const EXPIRY_DAYS = Number(process.env.LUXCLOUD_EXPIRY_DAYS || 15);
const TRASH_RETENTION_DAYS = Number(process.env.LUXCLOUD_TRASH_RETENTION_DAYS || 30);
const EXPIRY_WARN_DAYS = Number(process.env.LUXCLOUD_EXPIRY_WARN_DAYS || 8);
const EXPIRY_FINAL_WARN_DAYS = Number(process.env.LUXCLOUD_EXPIRY_FINAL_WARN_DAYS || 12);

const DEFAULT_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;
const DEFAULT_MAX_INSTANCES = 10;

const MAX_BLOB_BYTES = Number(process.env.LUXCLOUD_MAX_BLOB_BYTES || 200 * 1024 * 1024);
const MAX_BATCH_BYTES = Number(process.env.LUXCLOUD_MAX_BATCH_BYTES || 4 * 1024 * 1024);
const MAX_BATCH_ENTRIES = Number(process.env.LUXCLOUD_MAX_BATCH_ENTRIES || 500);

const ZSTD_AVAILABLE = typeof require('zlib').createZstdDecompress === 'function';
const SUPPORTED_COMPRESSIONS = ZSTD_AVAILABLE ? ['none', 'zstd'] : ['none'];

const INSTANCE_UUID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const MC_VERSION_RE = /^[0-9A-Za-z._+-]{1,32}$/;
const LOADER_RE = /^[a-z]{1,32}$/;
const LOADER_VERSION_RE = /^[0-9A-Za-z._+-]{1,48}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;

function cleanText(value, maxLength) {
    if (typeof value !== 'string') return null;
    const cleaned = Array.from(value)
        .filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127)
        .join('')
        .trim()
        .slice(0, maxLength);
    return cleaned.length > 0 ? cleaned : null;
}

function expiresAt(lastTouchedAt) {
    if (!lastTouchedAt) return null;
    const touched = new Date(lastTouchedAt).getTime();
    if (Number.isNaN(touched)) return null;
    return touched + EXPIRY_DAYS * 24 * 60 * 60 * 1000;
}

function purgesAt(trashedAt) {
    if (!trashedAt) return null;
    const trashed = new Date(trashedAt).getTime();
    if (Number.isNaN(trashed)) return null;
    return trashed + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
}

module.exports = {
    DEFAULT_MAX_INSTANCES,
    MAX_BATCH_BYTES,
    MAX_BATCH_ENTRIES,
    MAX_BLOB_BYTES,
    SUPPORTED_COMPRESSIONS,
    ZSTD_AVAILABLE,
    DEFAULT_QUOTA_BYTES,
    EXPIRY_DAYS,
    EXPIRY_FINAL_WARN_DAYS,
    EXPIRY_WARN_DAYS,
    INSTANCE_UUID_RE,
    LOADER_RE,
    LOADER_VERSION_RE,
    MC_VERSION_RE,
    SHA256_RE,
    TRASH_RETENTION_DAYS,
    cleanText,
    expiresAt,
    purgesAt
};
