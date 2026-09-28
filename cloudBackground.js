const crypto = require('crypto');
const pool = require('./database');
const { getStorage } = require('./storage');

const MAX_BACKGROUND_BYTES = Number(process.env.LUXCLOUD_MAX_BACKGROUND_BYTES || 50 * 1024 * 1024);

const FORMATS = [
    { mime: 'image/png', ext: 'png', type: 'image', test: (b) => b.length >= 8 && b.readUInt32BE(0) === 0x89504e47 },
    { mime: 'image/jpeg', ext: 'jpg', type: 'image', test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    { mime: 'image/gif', ext: 'gif', type: 'image', test: (b) => b.length >= 6 && b.toString('ascii', 0, 4) === 'GIF8' },
    {
        mime: 'image/webp', ext: 'webp', type: 'image',
        test: (b) => b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP'
    },
    { mime: 'video/webm', ext: 'webm', type: 'video', test: (b) => b.length >= 4 && b.readUInt32BE(0) === 0x1a45dfa3 },
    { mime: 'video/mp4', ext: 'mp4', type: 'video', test: (b) => b.length >= 12 && b.toString('ascii', 4, 8) === 'ftyp' }
];

// Der Content-Type, den der Client mitschickt, zaehlt nicht: gespeichert und spaeter
// ausgeliefert wird nur, was die ersten Bytes tatsaechlich als Bild oder Video ausweisen.
function detectFormat(buffer) {
    if (!Buffer.isBuffer(buffer)) return null;
    return FORMATS.find((format) => format.test(buffer)) || null;
}

function backgroundKey(userId, hash, ext) {
    return `backgrounds/${Number(userId)}/${hash}.${ext}`;
}

function serializeBackground(row) {
    if (!row || !row.background_key || !row.background_hash) return null;
    const format = FORMATS.find((entry) => entry.mime === row.background_mime);
    return {
        hash: row.background_hash,
        mime: row.background_mime,
        type: format ? format.type : 'image',
        ext: format ? format.ext : null,
        bytes: Number(row.background_bytes || 0),
        updatedAt: row.background_updated_at ? new Date(row.background_updated_at).getTime() : null
    };
}

async function loadBackgroundRow(userId, executor = pool) {
    const [rows] = await executor.query(
        `SELECT background_key, background_hash, background_mime, background_bytes, background_updated_at
           FROM user_cloud_settings WHERE user_id = ?`,
        [userId]
    );
    return rows[0] || null;
}

async function saveBackground(userId, buffer, format, executor = pool) {
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const key = backgroundKey(userId, hash, format.ext);
    const previous = await loadBackgroundRow(userId, executor);

    await getStorage().put(key, buffer, {});
    await executor.query(
        `UPDATE user_cloud_settings
            SET background_key = ?, background_hash = ?, background_mime = ?,
                background_bytes = ?, background_updated_at = NOW(), updated_at = NOW()
          WHERE user_id = ?`,
        [key, hash, format.mime, buffer.length, userId]
    );

    if (previous && previous.background_key && previous.background_key !== key) {
        await getStorage().remove([previous.background_key]).catch((err) => {
            console.warn(`[LuxCloud] Old background of user ${userId} could not be removed:`, err.message);
        });
    }

    return serializeBackground(await loadBackgroundRow(userId, executor));
}

async function clearBackground(userId, executor = pool) {
    const previous = await loadBackgroundRow(userId, executor);
    await executor.query(
        `UPDATE user_cloud_settings
            SET background_key = NULL, background_hash = NULL, background_mime = NULL,
                background_bytes = NULL, background_updated_at = NOW(), updated_at = NOW()
          WHERE user_id = ?`,
        [userId]
    );

    if (previous && previous.background_key) {
        await getStorage().remove([previous.background_key]).catch((err) => {
            console.warn(`[LuxCloud] Background of user ${userId} could not be removed:`, err.message);
        });
        return true;
    }
    return false;
}

module.exports = {
    MAX_BACKGROUND_BYTES,
    clearBackground,
    detectFormat,
    loadBackgroundRow,
    saveBackground,
    serializeBackground
};
