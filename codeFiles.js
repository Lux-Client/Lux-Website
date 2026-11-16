// Eigene Dateien in Modpack-Codes: Mods, Packs und Shader, die weder Modrinth noch
// CurseForge kennt, laedt der Launcher in den Cloud-Speicher des Lux-Kontos hoch. Wer den
// Code importiert, laedt sie von hier. Sie zaehlen gegen dasselbe Speicherlimit wie die
// Cloud-Instanzen und verschwinden zusammen mit dem Code.
//
// modpack_code_blobs: was ein Konto hochgeladen hat (pro Konto und Datei einmal, das ist
//                     auch das, was gegen den Speicher zaehlt).
// modpack_code_files: welche Datei in welchem Code steckt. Ohne Eintrag hier wird ein
//                     hochgeladener Blob nach UPLOAD_GRACE_HOURS wieder geloescht.
// Die Bytes selbst liegen einmal pro Inhalt im Storage unter codefiles/.
const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

const pool = require('./database');
const { getStorage } = require('./storage');
const { SHA256_RE } = require('./cloudConfig');
const { builtinScan } = require('./codeFileScan');
const scanQueue = require('./scanQueue');


const MAX_CODE_FILE_BYTES = Number(process.env.LUX_CODE_FILE_MAX_BYTES || 200 * 1024 * 1024);
const MAX_FILES_PER_CODE = Number(process.env.LUX_CODE_FILE_MAX_PER_CODE || 100);
const UPLOAD_GRACE_HOURS = Number(process.env.LUX_CODE_FILE_GRACE_HOURS || 24);

const KINDS = new Set(['mod', 'resourcepack', 'shader']);
const FILE_NAME_RE = /^[^\\/:*?"<>|\x00-\x1f]{1,200}$/;
const ALLOWED_EXTENSIONS = /\.(jar|zip|litemod)(\.disabled)?$/i;

function codeFileKey(hash) {
    return `codefiles/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}`;
}

function isHash(value) {
    return typeof value === 'string' && SHA256_RE.test(value);
}

function cleanFileName(value) {
    if (typeof value !== 'string') return null;
    const base = path.basename(value.trim());
    if (!base || base === '.' || base === '..') return null;
    if (!FILE_NAME_RE.test(base) || !ALLOWED_EXTENSIONS.test(base)) return null;
    return base;
}

function cleanTitle(value, fallback) {
    if (typeof value !== 'string') return fallback;
    const cleaned = Array.from(value).filter((ch) => ch.charCodeAt(0) >= 32).join('').trim().slice(0, 120);
    return cleaned || fallback;
}

function placeholders(count) {
    return new Array(count).fill('?').join(', ');
}

async function codeFileBytes(userId, executor = pool) {
    if (!userId) return 0;
    const [rows] = await executor.query(
        'SELECT COALESCE(SUM(size), 0) AS total FROM modpack_code_blobs WHERE user_id = ?',
        [userId]
    );
    return Number(rows[0] ? rows[0].total : 0);
}

// Gesamtverbrauch eines Kontos: Cloud-Instanzen (used_bytes) plus Code-Dateien.
async function storageUsage(userId, executor = pool) {
    const [rows] = await executor.query(
        'SELECT quota_bytes, used_bytes FROM user_cloud_settings WHERE user_id = ?',
        [userId]
    );
    const row = rows[0] || {};
    const instanceBytes = Number(row.used_bytes || 0);
    const codeBytes = await codeFileBytes(userId, executor);
    const quotaBytes = Number(row.quota_bytes || 0);
    const usedBytes = instanceBytes + codeBytes;
    return {
        quotaBytes,
        usedBytes,
        instanceBytes,
        codeFileBytes: codeBytes,
        availableBytes: quotaBytes > 0 ? Math.max(quotaBytes - usedBytes, 0) : null
    };
}

async function ownedHashes(userId, hashes, executor = pool) {
    const owned = new Map();
    const unique = [...new Set(hashes.filter(isHash))];
    for (let i = 0; i < unique.length; i += 500) {
        const batch = unique.slice(i, i + 500);
        const [rows] = await executor.query(
            `SELECT sha256, size FROM modpack_code_blobs WHERE user_id = ? AND sha256 IN (${placeholders(batch.length)})`,
            [userId, ...batch]
        );
        for (const row of rows) owned.set(String(row.sha256).trim(), Number(row.size));
    }
    return owned;
}

// Vor dem Hochladen: passt das noch in den Speicher? Was das Konto schon hochgeladen hat,
// zaehlt nicht doppelt.
async function checkFiles(userId, files, executor = pool) {
    const wanted = new Map();
    for (const file of files) {
        if (!file || !isHash(file.sha256)) return { error: 'Every file needs a sha256 hash.' };
        const size = Number(file.size);
        if (!Number.isSafeInteger(size) || size <= 0) return { error: 'Every file needs a size.' };
        if (size > MAX_CODE_FILE_BYTES) {
            return { error: `${cleanFileName(file.fileName) || 'A file'} is larger than ${Math.round(MAX_CODE_FILE_BYTES / 1024 / 1024)} MB.`, tooLarge: true };
        }
        wanted.set(file.sha256, size);
    }

    const owned = await ownedHashes(userId, [...wanted.keys()], executor);
    const missing = [...wanted.keys()].filter((hash) => !owned.has(hash));
    const neededBytes = missing.reduce((sum, hash) => sum + wanted.get(hash), 0);
    const usage = await storageUsage(userId, executor);
    const fits = usage.quotaBytes <= 0 || usage.usedBytes + neededBytes <= usage.quotaBytes;
    return { usage, missing, neededBytes, fits };
}

function receiveToFile(req, file, limit) {
    return new Promise((resolve, reject) => {
        let received = 0;
        let failed = false;
        const hash = crypto.createHash('sha256');
        const out = fs.createWriteStream(file);

        const fail = (err) => {
            if (failed) return;
            failed = true;
            req.unpipe(out);
            out.destroy();
            reject(err);
        };

        req.on('data', (chunk) => {
            received += chunk.length;
            if (received > limit) {
                const err = new Error('file_too_large');
                err.code = 'FILE_TOO_LARGE';
                fail(err);
                return;
            }
            hash.update(chunk);
        });
        req.on('error', fail);
        out.on('error', fail);
        out.on('finish', () => {
            if (!failed) resolve({ size: received, digest: hash.digest('hex') });
        });
        req.pipe(out);
    });
}

function stagingFile(userId, hash) {
    const base = process.env.LUXCLOUD_STAGING_DIR || path.join(process.env.DATA_DIR || os.tmpdir(), 'luxcloud-staging');
    return path.join(base, 'codefiles', `${userId}-${hash}-${crypto.randomBytes(4).toString('hex')}.part`);
}

class CodeFileError extends Error {
    constructor(status, code, message, details = null) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

// Nimmt eine Datei entgegen (roher Body), prueft Hash und Speicherlimit und merkt sie fuer
// das Konto vor. Gehoert sie dem Konto schon, passiert nichts.
async function receiveUpload(req, userId, hash) {
    if (!isHash(hash)) throw new CodeFileError(400, 'invalid_request', 'Invalid file hash');

    const declared = Number(req.get('content-length'));
    if (!Number.isInteger(declared) || declared <= 0) {
        throw new CodeFileError(411, 'invalid_request', 'Content-Length is required');
    }
    if (declared > MAX_CODE_FILE_BYTES) {
        throw new CodeFileError(413, 'file_too_large', `Files can be at most ${Math.round(MAX_CODE_FILE_BYTES / 1024 / 1024)} MB.`);
    }

    const owned = await ownedHashes(userId, [hash]);
    if (owned.has(hash)) {
        req.resume();
        return { sha256: hash, size: owned.get(hash), existing: true };
    }

    const before = await storageUsage(userId);
    if (before.quotaBytes > 0 && before.usedBytes + declared > before.quotaBytes) {
        req.resume();
        throw new CodeFileError(413, 'quota_exceeded', 'Not enough cloud storage for this file.', {
            ...before,
            neededBytes: before.usedBytes + declared - before.quotaBytes
        });
    }

    const file = stagingFile(userId, hash);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    try {
        let received;
        try {
            received = await receiveToFile(req, file, MAX_CODE_FILE_BYTES);
        } catch (err) {
            if (err && err.code === 'FILE_TOO_LARGE') {
                throw new CodeFileError(413, 'file_too_large', 'File is too large.');
            }
            throw err;
        }
        if (received.digest !== hash) {
            throw new CodeFileError(400, 'hash_mismatch', 'Uploaded data does not match the requested hash');
        }

        // Die schnelle eigene Pruefung sofort: offensichtlich Boeses wird gar nicht erst
        // gespeichert. ClamAV kommt danach ueber die Warteschlange (scanQueue.js).
        const scan = await builtinScan(file);
        if (scan.status === 'infected') {
            console.warn(`[CodeFiles] Rejected upload ${hash} of user ${userId}: ${scan.engine}: ${scan.reason}`);
            throw new CodeFileError(422, 'file_infected',
                `This file was blocked by the virus check (${scan.reason}). It was not uploaded.`, { engine: scan.engine, reason: scan.reason });
        }
        if (scan.status !== 'clean') {
            throw new CodeFileError(503, 'scan_unavailable',
                'The virus check could not read this file. Please try again later.', { reason: scan.reason });
        }
        // Kennt der Server die Datei schon mit Befund (anderes Konto), gilt der weiter.
        const known = await knownVerdict(hash);
        if (known && known.status === 'infected') {
            throw new CodeFileError(422, 'file_infected',
                `This file was blocked by the virus check (${known.reason || 'flagged'}). It was not uploaded.`, { engine: known.engine, reason: known.reason });
        }
        const verdict = known && known.status === 'clean' ? known : { status: 'pending', engine: null, reason: null, scannedAt: null };

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            await connection.query(
                `INSERT INTO user_cloud_settings (user_id) VALUES (?)
                 ON CONFLICT (user_id) DO NOTHING RETURNING user_id`,
                [userId]
            );
            await connection.query('SELECT user_id FROM user_cloud_settings WHERE user_id = ? FOR UPDATE', [userId]);
            const usage = await storageUsage(userId, connection);
            if (usage.quotaBytes > 0 && usage.usedBytes + received.size > usage.quotaBytes) {
                await connection.rollback();
                throw new CodeFileError(413, 'quota_exceeded', 'Not enough cloud storage for this file.', {
                    ...usage,
                    neededBytes: usage.usedBytes + received.size - usage.quotaBytes
                });
            }

            const storage = getStorage();
            const key = codeFileKey(hash);
            if (!await storage.head(key).catch(() => null)) {
                await storage.put(key, fs.createReadStream(file), { originalSize: received.size, storedSize: received.size });
            }
            await connection.query(
                `INSERT INTO modpack_code_blobs (user_id, sha256, size, scan_status, scan_engine, scan_reason, scanned_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT (user_id, sha256) DO NOTHING RETURNING id`,
                [userId, hash, received.size, verdict.status, verdict.engine, null, verdict.scannedAt || null]
            );
            await connection.commit();
        } catch (err) {
            await connection.rollback().catch(() => {});
            throw err;
        } finally {
            connection.release();
        }

        let position = null;
        if (verdict.status === 'pending') {
            await scanQueue.enqueue(hash, 'upload', { by: `user:${userId}` });
            position = (await scanQueue.queueInfo([hash])).position;
        }
        return {
            sha256: hash,
            size: received.size,
            existing: false,
            scan: { status: verdict.status, engine: verdict.engine, queuePosition: position }
        };
    } finally {
        await fsp.rm(file, { force: true }).catch(() => {});
    }
}

// Prueft die Liste aus dem Export und gibt sie bereinigt zurueck. Jede Datei muss vorher
// von genau diesem Konto hochgeladen worden sein.
async function validateUploads(userId, uploads, executor = pool) {
    if (!Array.isArray(uploads) || uploads.length === 0) return { files: [] };
    if (!userId) return { error: 'Sign in with your Lux account to include your own files.', status: 401 };
    if (uploads.length > MAX_FILES_PER_CODE) {
        return { error: `A code can carry at most ${MAX_FILES_PER_CODE} own files.`, status: 400 };
    }

    const owned = await ownedHashes(userId, uploads.map((entry) => entry && entry.sha256), executor);
    const files = [];
    const seen = new Set();
    for (const entry of uploads) {
        const sha256 = entry && entry.sha256;
        const fileName = cleanFileName(entry && entry.fileName);
        const kind = entry && KINDS.has(entry.kind) ? entry.kind : null;
        if (!isHash(sha256) || !fileName || !kind) {
            return { error: 'Invalid entry in the list of own files.', status: 400 };
        }
        if (!owned.has(sha256)) {
            return { error: `${fileName} was not uploaded to your cloud storage.`, status: 409 };
        }
        if (await isBlocked(sha256, executor)) {
            return { error: `${fileName} was blocked by the virus check and can't be shared.`, status: 422 };
        }
        const key = `${kind}:${fileName.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        files.push({
            sha256,
            size: owned.get(sha256),
            fileName,
            kind,
            title: cleanTitle(entry.title, fileName)
        });
    }
    return { files };
}

// Ersetzt, was ein Code an eigenen Dateien mitbringt.
async function attachToCode(code, userId, files, executor = pool) {
    const previous = await releaseCode(code, executor, { keepBlobs: true });
    for (const file of files) {
        await executor.query(
            `INSERT INTO modpack_code_files (code, user_id, sha256, kind, file_name, size)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [code, userId, file.sha256, file.kind, file.fileName, file.size]
        );
    }
    if (previous.length > 0) await dropUnusedBlobs(previous, executor);
}

async function filesOfCode(code, executor = pool) {
    const [rows] = await executor.query(
        `SELECT f.sha256, f.kind, f.file_name, f.size, f.user_id,
                b.scan_status, b.scan_engine, b.scan_reason, b.scanned_at
           FROM modpack_code_files f
           LEFT JOIN modpack_code_blobs b ON b.user_id = f.user_id AND b.sha256 = f.sha256
          WHERE f.code = ? ORDER BY f.id`,
        [code]
    );
    return rows.map((row) => ({
        sha256: String(row.sha256).trim(),
        kind: row.kind,
        fileName: row.file_name,
        size: Number(row.size),
        userId: row.user_id,
        scan: {
            status: row.scan_status || 'pending',
            engine: row.scan_engine || null,
            reason: row.scan_reason || null,
            scannedAt: row.scanned_at || null
        }
    }));
}

async function isBlocked(hash, executor = pool) {
    const [rows] = await executor.query(
        'SELECT 1 AS ok FROM modpack_code_blobs WHERE sha256 = ? AND scan_status = ? LIMIT 1',
        [hash, 'infected']
    );
    return rows.length > 0;
}

// Befund, den eine Datei mit diesem Inhalt schon hat (egal welches Konto sie hochlud).
async function knownVerdict(hash, executor = pool) {
    const [rows] = await executor.query(
        `SELECT scan_status, scan_engine, scan_reason, scanned_at FROM modpack_code_blobs
          WHERE sha256 = ? AND scan_status IN ('clean', 'infected')
          ORDER BY CASE WHEN scan_status = 'infected' THEN 0 ELSE 1 END LIMIT 1`,
        [hash]
    );
    const row = rows[0];
    if (!row) return null;
    return { status: row.scan_status, engine: row.scan_engine || null, reason: row.scan_reason || null, scannedAt: row.scanned_at || null };
}

// Pruefstand aller eigenen Dateien eines Codes: 'clean' (alles geprueft), 'pending'
// (noch in der Warteschlange), 'error' (Pruefung gescheitert) oder 'infected'.
async function codeScanState(code, executor = pool) {
    const files = await filesOfCode(code, executor);
    const pending = files.filter((file) => file.scan.status === 'pending');
    const failed = files.filter((file) => file.scan.status === 'error');
    const infected = files.filter((file) => file.scan.status === 'infected');
    let status = 'clean';
    if (infected.length > 0) status = 'infected';
    else if (failed.length > 0) status = 'error';
    else if (pending.length > 0) status = 'pending';
    return { status, files, pending, failed, infected };
}

async function codeHasFile(code, hash, executor = pool) {
    const [rows] = await executor.query(
        `SELECT f.size, f.file_name, b.scan_status
           FROM modpack_code_files f
           LEFT JOIN modpack_code_blobs b ON b.user_id = f.user_id AND b.sha256 = f.sha256
          WHERE f.code = ? AND f.sha256 = ? LIMIT 1`,
        [code, hash]
    );
    return rows[0] || null;
}

// Loest die Dateien eines Codes. Danach wird geloescht, was kein Code mehr braucht.
async function releaseCode(code, executor = pool, { keepBlobs = false } = {}) {
    const [rows] = await executor.query(
        'SELECT user_id, sha256 FROM modpack_code_files WHERE code = ?',
        [code]
    );
    if (rows.length === 0) return [];
    await executor.query('DELETE FROM modpack_code_files WHERE code = ?', [code]);
    const pairs = rows.map((row) => ({ userId: row.user_id, sha256: String(row.sha256).trim() }));
    if (!keepBlobs) await dropUnusedBlobs(pairs, executor);
    return pairs;
}

async function dropUnusedBlobs(pairs, executor = pool) {
    const removedHashes = new Set();
    const seen = new Set();
    for (const { userId, sha256 } of pairs) {
        const key = `${userId}:${sha256}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const [still] = await executor.query(
            'SELECT 1 AS ok FROM modpack_code_files WHERE user_id = ? AND sha256 = ? LIMIT 1',
            [userId, sha256]
        );
        if (still.length > 0) continue;
        await executor.query('DELETE FROM modpack_code_blobs WHERE user_id = ? AND sha256 = ?', [userId, sha256]);
        removedHashes.add(sha256);
    }
    await deleteStoredIfUnused([...removedHashes], executor);
}

async function deleteStoredIfUnused(hashes, executor = pool) {
    const keys = [];
    for (const hash of hashes) {
        const [rows] = await executor.query('SELECT 1 AS ok FROM modpack_code_blobs WHERE sha256 = ? LIMIT 1', [hash]);
        if (rows.length === 0) keys.push(codeFileKey(hash));
    }
    if (keys.length > 0) {
        try {
            await getStorage().remove(keys);
        } catch (err) {
            console.error('[CodeFiles] Could not delete stored files:', err.message);
        }
    }
}

// Hochgeladen, aber nie in einem Code gelandet (Export abgebrochen): nach einer Weile weg.
async function pruneStaleUploads(executor = pool) {
    const [rows] = await executor.query(
        `SELECT b.user_id, b.sha256 FROM modpack_code_blobs b
           LEFT JOIN modpack_code_files f ON f.user_id = b.user_id AND f.sha256 = b.sha256
          WHERE b.created_at < NOW() - INTERVAL '${UPLOAD_GRACE_HOURS} hours'
            AND f.id IS NULL`
    );
    if (rows.length === 0) return { removed: 0 };
    await dropUnusedBlobs(rows.map((row) => ({ userId: row.user_id, sha256: String(row.sha256).trim() })), executor);
    return { removed: rows.length };
}

async function openStoredFile(hash) {
    return getStorage().get(codeFileKey(hash));
}

module.exports = {
    CodeFileError,
    MAX_CODE_FILE_BYTES,
    MAX_FILES_PER_CODE,
    UPLOAD_GRACE_HOURS,
    attachToCode,
    checkFiles,
    cleanFileName,
    codeFileBytes,
    codeFileKey,
    codeHasFile,
    filesOfCode,
    codeScanState,
    isBlocked,
    isHash,
    knownVerdict,
    openStoredFile,
    pruneStaleUploads,
    receiveUpload,
    releaseCode,
    storageUsage,
    validateUploads
};
