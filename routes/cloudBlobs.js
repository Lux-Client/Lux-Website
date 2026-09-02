const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const express = require('express');
const { rateLimit } = require('express-rate-limit');

const { cloudError, ensureDeviceAuth } = require('../middleware/deviceAuth');
const {
    MAX_BATCH_BYTES,
    MAX_BATCH_ENTRIES,
    MAX_BLOB_BYTES,
    SHA256_RE,
    SUPPORTED_COMPRESSIONS
} = require('../cloudConfig');
const { blobKey, getStorage } = require('../storage');
const {
    claimUpload,
    getBlob,
    registerBlob,
    userMayReadBlob
} = require('../cloudBlobs');

const router = express.Router();

const PRESIGN_TTL_SECONDS = Number(process.env.LUXCLOUD_PRESIGN_TTL_SECONDS || 300);
const REDIRECT_DOWNLOADS = String(process.env.LUXCLOUD_BLOB_REDIRECT || '').toLowerCase() === 'true';

const COMPRESSIONS = new Set(SUPPORTED_COMPRESSIONS);

const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: Number(process.env.LUXCLOUD_UPLOAD_LIMIT_PER_HOUR || 2000),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `dev:${req.device ? req.device.uuid : 'anon'}`,
    handler: (req, res) => cloudError(res, 429, 'rate_limited', 'Too many blob uploads', { retryAfter: 300 })
});

function stagingDir() {
    const base = process.env.LUXCLOUD_STAGING_DIR
        || path.join(process.env.DATA_DIR || os.tmpdir(), 'luxcloud-staging');
    return base;
}

function stagingPath(deviceId, hash) {
    return path.join(stagingDir(), String(deviceId), `${hash}.part`);
}

function parseContentRange(value) {
    if (!value) return null;
    const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(String(value).trim());
    if (!match) return { invalid: true };
    const start = Number(match[1]);
    const end = Number(match[2]);
    const total = Number(match[3]);
    if (end < start || total <= end) return { invalid: true };
    return { start, end, total };
}

async function stagedSize(file) {
    try {
        const stat = await fsp.stat(file);
        return stat.size;
    } catch (err) {
        if (err.code === 'ENOENT') return 0;
        throw err;
    }
}

function receiveInto(req, file, { append, limit }) {
    return new Promise((resolve, reject) => {
        let received = 0;
        let aborted = false;

        const out = fs.createWriteStream(file, { flags: append ? 'a' : 'w' });

        const fail = (err) => {
            if (aborted) return;
            aborted = true;
            req.unpipe(out);
            out.destroy();
            reject(err);
        };

        req.on('data', (chunk) => {
            received += chunk.length;
            if (received > limit) {
                const err = new Error('blob_too_large');
                err.code = 'BLOB_TOO_LARGE';
                fail(err);
            }
        });
        req.on('error', fail);
        out.on('error', fail);
        out.on('finish', () => { if (!aborted) resolve(received); });

        req.pipe(out);
    });
}

async function hashStagedFile(file, compression) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        let originalSize = 0;

        const source = fs.createReadStream(file);
        const pipeline = compression === 'zstd' ? source.pipe(zlib.createZstdDecompress()) : source;

        source.on('error', reject);
        pipeline.on('error', reject);
        pipeline.on('data', (chunk) => {
            originalSize += chunk.length;
            hash.update(chunk);
        });
        pipeline.on('end', () => resolve({ digest: hash.digest('hex'), originalSize }));
    });
}

async function finalizeUpload({ req, res, hash, compression, file }) {
    const storedStat = await fsp.stat(file);
    let verified;
    try {
        verified = await hashStagedFile(file, compression);
    } catch (err) {
        await fsp.rm(file, { force: true });
        return cloudError(res, 400, 'hash_mismatch', 'Uploaded data could not be decompressed');
    }

    if (verified.digest !== hash) {
        await fsp.rm(file, { force: true });
        return cloudError(res, 400, 'hash_mismatch', 'Uploaded data does not match the requested hash');
    }
    if (verified.originalSize > MAX_BLOB_BYTES) {
        await fsp.rm(file, { force: true });
        return cloudError(res, 413, 'blob_too_large', 'Blob exceeds the maximum size');
    }

    const storage = getStorage();
    await storage.put(blobKey(hash), fs.createReadStream(file), {
        compression,
        originalSize: verified.originalSize,
        storedSize: storedStat.size
    });
    await fsp.rm(file, { force: true });

    await registerBlob({
        hash,
        size: verified.originalSize,
        storedSize: storedStat.size,
        compression
    });
    await claimUpload(hash, req.cloudUserId, req.device.id);

    return res.status(201).json({ hash, size: verified.originalSize, storedSize: storedStat.size });
}

router.put('/blobs/:hash', ensureDeviceAuth, uploadLimiter, async (req, res) => {
    const hash = String(req.params.hash || '').toLowerCase();
    if (!SHA256_RE.test(hash)) {
        return cloudError(res, 400, 'invalid_request', 'Invalid blob hash');
    }

    const compression = String(req.get('x-lux-compression') || 'none').toLowerCase();
    if (!COMPRESSIONS.has(compression)) {
        return cloudError(res, 400, 'invalid_request', `Unsupported compression: ${compression}`);
    }

    const declaredLength = Number(req.get('content-length'));
    if (!Number.isInteger(declaredLength) || declaredLength <= 0) {
        return cloudError(res, 411, 'invalid_request', 'Content-Length is required');
    }
    if (declaredLength > MAX_BLOB_BYTES) {
        return cloudError(res, 413, 'blob_too_large', 'Blob exceeds the maximum size');
    }

    const range = parseContentRange(req.get('content-range'));
    if (range && range.invalid) {
        return cloudError(res, 400, 'invalid_request', 'Malformed Content-Range');
    }
    if (range && range.total > MAX_BLOB_BYTES) {
        return cloudError(res, 413, 'blob_too_large', 'Blob exceeds the maximum size');
    }

    try {
        const existing = await getBlob(hash);
        if (existing && await getStorage().head(blobKey(hash)).catch(() => null)) {
            await claimUpload(hash, req.cloudUserId, req.device.id);
            return res.status(409).json({
                error: 'already_exists',
                message: 'Blob is already stored',
                hash,
                size: Number(existing.size),
                storedSize: Number(existing.stored_size)
            });
        }

        const file = stagingPath(req.device.id, hash);
        await fsp.mkdir(path.dirname(file), { recursive: true });

        if (!range) {
            await receiveInto(req, file, { append: false, limit: MAX_BLOB_BYTES });
            return await finalizeUpload({ req, res, hash, compression, file });
        }

        const already = await stagedSize(file);
        if (range.start !== already) {
            return res.status(409).json({
                error: 'range_mismatch',
                message: 'Continue from the offset the server already holds',
                receivedBytes: already
            });
        }

        await receiveInto(req, file, { append: already > 0, limit: MAX_BLOB_BYTES });
        const received = await stagedSize(file);

        if (received < range.total) {
            return res.status(202).json({ receivedBytes: received });
        }
        return await finalizeUpload({ req, res, hash, compression, file });
    } catch (err) {
        if (err && err.code === 'BLOB_TOO_LARGE') {
            await fsp.rm(stagingPath(req.device.id, hash), { force: true });
            return cloudError(res, 413, 'blob_too_large', 'Blob exceeds the maximum size');
        }
        console.error('[LuxCloud] PUT /blobs failed:', err);
        return cloudError(res, 500, 'server_error', 'Upload failed');
    }
});

router.post('/blobs/batch', ensureDeviceAuth, uploadLimiter, async (req, res) => {
    const items = req.body && Array.isArray(req.body.blobs) ? req.body.blobs : null;
    if (!items || items.length === 0) {
        return cloudError(res, 400, 'invalid_request', 'Missing blobs array');
    }
    if (items.length > MAX_BATCH_ENTRIES) {
        return cloudError(res, 400, 'invalid_request', `At most ${MAX_BATCH_ENTRIES} blobs per batch`);
    }

    const prepared = [];
    let totalBytes = 0;

    for (const item of items) {
        const hash = String(item && item.hash ? item.hash : '').toLowerCase();
        if (!SHA256_RE.test(hash)) {
            return cloudError(res, 400, 'invalid_request', 'Invalid blob hash in batch');
        }
        const compression = String(item.compression || 'none').toLowerCase();
        if (!COMPRESSIONS.has(compression)) {
            return cloudError(res, 400, 'invalid_request', `Unsupported compression: ${compression}`);
        }
        if (typeof item.data !== 'string') {
            return cloudError(res, 400, 'invalid_request', 'Each batch entry needs base64 data');
        }

        const stored = Buffer.from(item.data, 'base64');
        totalBytes += stored.length;
        if (totalBytes > MAX_BATCH_BYTES) {
            return cloudError(res, 413, 'blob_too_large', 'Batch exceeds the maximum size', {
                details: { maxBatchBytes: MAX_BATCH_BYTES }
            });
        }
        prepared.push({ hash, compression, stored });
    }

    const stored = [];
    const skipped = [];
    const rejected = [];

    try {
        for (const item of prepared) {
            const existing = await getBlob(item.hash);
            if (existing && await getStorage().head(blobKey(item.hash)).catch(() => null)) {
                await claimUpload(item.hash, req.cloudUserId, req.device.id);
                skipped.push(item.hash);
                continue;
            }

            let original = item.stored;
            if (item.compression === 'zstd') {
                try {
                    original = zlib.zstdDecompressSync(item.stored);
                } catch (err) {
                    rejected.push({ hash: item.hash, error: 'hash_mismatch' });
                    continue;
                }
            }

            const digest = crypto.createHash('sha256').update(original).digest('hex');
            if (digest !== item.hash) {
                rejected.push({ hash: item.hash, error: 'hash_mismatch' });
                continue;
            }

            await getStorage().put(blobKey(item.hash), item.stored, {
                compression: item.compression,
                originalSize: original.length,
                storedSize: item.stored.length
            });
            await registerBlob({
                hash: item.hash,
                size: original.length,
                storedSize: item.stored.length,
                compression: item.compression
            });
            await claimUpload(item.hash, req.cloudUserId, req.device.id);
            stored.push(item.hash);
        }

        return res.status(rejected.length > 0 ? 207 : 201).json({ stored, skipped, rejected });
    } catch (err) {
        console.error('[LuxCloud] POST /blobs/batch failed:', err);
        return cloudError(res, 500, 'server_error', 'Batch upload failed');
    }
});

router.get('/blobs/:hash', ensureDeviceAuth, async (req, res) => {
    const hash = String(req.params.hash || '').toLowerCase();
    if (!SHA256_RE.test(hash)) {
        return cloudError(res, 404, 'not_found', 'Blob not found');
    }

    try {
        const blob = await getBlob(hash);
        if (!blob) return cloudError(res, 404, 'not_found', 'Blob not found');

        const allowed = await userMayReadBlob(hash, req.cloudUserId);
        if (!allowed) return cloudError(res, 404, 'not_found', 'Blob not found');

        const storage = getStorage();
        res.setHeader('X-Lux-Compression', blob.compression || 'none');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', 'attachment');
        res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');

        if (REDIRECT_DOWNLOADS && storage.canPresign) {
            const url = await storage.presignGet(blob.storage_key, PRESIGN_TTL_SECONDS);
            return res.redirect(302, url);
        }

        const object = await storage.get(blob.storage_key);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', String(object.size || blob.stored_size));

        object.stream.on('error', (err) => {
            console.error('[LuxCloud] Blob stream failed:', err);
            res.destroy();
        });
        return object.stream.pipe(res);
    } catch (err) {
        console.error('[LuxCloud] GET /blobs failed:', err);
        return cloudError(res, 500, 'server_error', 'Download failed');
    }
});

router.get('/blobs/:hash/head', ensureDeviceAuth, async (req, res) => {
    const hash = String(req.params.hash || '').toLowerCase();
    if (!SHA256_RE.test(hash)) return cloudError(res, 404, 'not_found', 'Blob not found');

    try {
        const blob = await getBlob(hash);
        if (!blob) return cloudError(res, 404, 'not_found', 'Blob not found');
        if (!await userMayReadBlob(hash, req.cloudUserId)) {
            return cloudError(res, 404, 'not_found', 'Blob not found');
        }
        return res.json({
            hash: blob.hash,
            size: Number(blob.size),
            storedSize: Number(blob.stored_size),
            compression: blob.compression
        });
    } catch (err) {
        console.error('[LuxCloud] GET /blobs/:hash/head failed:', err);
        return cloudError(res, 500, 'server_error', 'Lookup failed');
    }
});

module.exports = router;
