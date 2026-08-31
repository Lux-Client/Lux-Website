const MANIFEST_VERSION = 1;
const MAX_ENTRIES = Number(process.env.LUXCLOUD_MAX_MANIFEST_ENTRIES || 50000);
const MAX_PATH_LENGTH = 400;
const MAX_SEGMENT_LENGTH = 120;
const MAX_SEGMENTS = 24;
const MAX_NAME_LENGTH = 120;

const FORBIDDEN_SEGMENT_CHARS = new Set(['<', '>', ':', '"', '|', '?', '*', '\\', '/']);
const WINDOWS_RESERVED = new Set([
    'con', 'prn', 'aux', 'nul',
    'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
    'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'
]);

const SHA256_RE = /^[0-9a-f]{64}$/;
const SHA1_RE = /^[0-9a-f]{40}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const CHUNK_ALGORITHMS = new Set(['fastcdc-1M']);

function hasControlChars(value) {
    for (let i = 0; i < value.length; i += 1) {
        const code = value.charCodeAt(i);
        if (code < 32 || code === 127) return true;
    }
    return false;
}

function validSegment(segment) {
    if (segment.length === 0 || segment.length > MAX_SEGMENT_LENGTH) return false;
    if (segment === '.' || segment === '..') return false;
    if (hasControlChars(segment)) return false;

    for (const char of segment) {
        if (FORBIDDEN_SEGMENT_CHARS.has(char)) return false;
    }

    if (segment.endsWith('.') || segment.endsWith(' ')) return false;

    const withoutExtension = segment.split('.')[0].toLowerCase();
    if (WINDOWS_RESERVED.has(withoutExtension)) return false;

    return true;
}

function validRelPath(value) {
    if (typeof value !== 'string') return false;
    if (value.length === 0 || value.length > MAX_PATH_LENGTH) return false;
    if (value.startsWith('/')) return false;
    if (value.includes('\\')) return false;
    if (hasControlChars(value)) return false;
    if (/^[a-zA-Z]:/.test(value)) return false;
    if (value.normalize('NFC') !== value) return false;

    const segments = value.split('/');
    if (segments.length > MAX_SEGMENTS) return false;

    return segments.every(validSegment);
}

function isInteger(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
    return Number.isInteger(value) && value >= min && value <= max;
}

function isShortString(value, maxLength) {
    return typeof value === 'string'
        && value.length > 0
        && value.length <= maxLength
        && !hasControlChars(value);
}

function validateEntry(entry, index, issues, seenPaths) {
    const at = `entries[${index}]`;

    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        issues.push({ path: at, reason: 'entry must be an object' });
        return null;
    }

    if (!validRelPath(entry.path)) {
        issues.push({ path: at, reason: 'invalid_path' });
        return null;
    }
    if (seenPaths.has(entry.path)) {
        issues.push({ path: at, reason: 'duplicate_path' });
        return null;
    }
    seenPaths.add(entry.path);

    if (!isInteger(entry.size)) {
        issues.push({ path: `${at}.size`, reason: 'size must be a non-negative integer' });
    }
    if (entry.mtime !== undefined && !isInteger(entry.mtime)) {
        issues.push({ path: `${at}.mtime`, reason: 'mtime must be a non-negative integer' });
    }
    if (typeof entry.sha256 !== 'string' || !SHA256_RE.test(entry.sha256)) {
        issues.push({ path: `${at}.sha256`, reason: 'sha256 must be a lowercase hex digest' });
    }

    const sources = ['blob', 'source', 'chunks'].filter((key) => entry[key] !== undefined);
    if (sources.length !== 1) {
        issues.push({ path: at, reason: 'entry needs exactly one of blob, source or chunks' });
        return null;
    }

    const blobs = [];

    if (entry.blob !== undefined) {
        if (typeof entry.blob !== 'string' || !SHA256_RE.test(entry.blob)) {
            issues.push({ path: `${at}.blob`, reason: 'blob must be a lowercase hex digest' });
        } else {
            blobs.push(entry.blob);
        }
    }

    if (entry.source !== undefined) {
        const source = entry.source;
        if (!source || typeof source !== 'object' || Array.isArray(source)) {
            issues.push({ path: `${at}.source`, reason: 'source must be an object' });
        } else if (source.type !== 'modrinth') {
            issues.push({ path: `${at}.source.type`, reason: 'only modrinth sources are supported' });
        } else if (!ID_RE.test(String(source.projectId || '')) || !ID_RE.test(String(source.versionId || ''))) {
            issues.push({ path: `${at}.source`, reason: 'projectId and versionId must be ids' });
        } else if (typeof source.sha1 !== 'string' || !SHA1_RE.test(source.sha1)) {
            issues.push({ path: `${at}.source.sha1`, reason: 'sha1 must be a lowercase hex digest' });
        }
    }

    if (entry.chunks !== undefined) {
        const chunks = entry.chunks;
        if (!chunks || typeof chunks !== 'object' || Array.isArray(chunks)) {
            issues.push({ path: `${at}.chunks`, reason: 'chunks must be an object' });
        } else if (!CHUNK_ALGORITHMS.has(String(chunks.algo || ''))) {
            issues.push({ path: `${at}.chunks.algo`, reason: 'unknown chunking algorithm' });
        } else if (typeof chunks.list !== 'string' || !SHA256_RE.test(chunks.list)) {
            issues.push({ path: `${at}.chunks.list`, reason: 'chunk list must be a blob hash' });
        } else {
            blobs.push(chunks.list);
        }
    }

    return { size: Number(entry.size) || 0, blobs, path: entry.path };
}

function validateManifest(manifest, { maxEntries = MAX_ENTRIES } = {}) {
    const issues = [];

    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
        return { valid: false, issues: [{ path: '', reason: 'manifest must be an object' }], stats: null };
    }

    if (manifest.manifestVersion !== MANIFEST_VERSION) {
        issues.push({ path: 'manifestVersion', reason: `expected ${MANIFEST_VERSION}` });
    }
    if (!ID_RE.test(String(manifest.instanceId || ''))) {
        issues.push({ path: 'instanceId', reason: 'missing or malformed instance id' });
    }
    if (!isShortString(manifest.name, MAX_NAME_LENGTH)) {
        issues.push({ path: 'name', reason: 'missing or malformed instance name' });
    }
    if (manifest.parentRevision !== undefined && !isInteger(manifest.parentRevision)) {
        issues.push({ path: 'parentRevision', reason: 'parentRevision must be a non-negative integer' });
    }
    if (manifest.createdAt !== undefined && !isInteger(manifest.createdAt)) {
        issues.push({ path: 'createdAt', reason: 'createdAt must be a timestamp' });
    }

    if (manifest.icon !== undefined) {
        if (!manifest.icon || typeof manifest.icon !== 'object'
            || typeof manifest.icon.blob !== 'string' || !SHA256_RE.test(manifest.icon.blob)) {
            issues.push({ path: 'icon.blob', reason: 'icon must reference a blob hash' });
        }
    }

    if (!Array.isArray(manifest.entries)) {
        issues.push({ path: 'entries', reason: 'entries must be an array' });
        return { valid: false, issues, stats: null };
    }
    if (manifest.entries.length > maxEntries) {
        issues.push({ path: 'entries', reason: `too many entries (max ${maxEntries})` });
        return { valid: false, issues, stats: null };
    }

    const seenPaths = new Set();
    const blobHashes = new Set();
    let logicalBytes = 0;
    let hasWorlds = false;

    for (let i = 0; i < manifest.entries.length; i += 1) {
        const result = validateEntry(manifest.entries[i], i, issues, seenPaths);
        if (!result) continue;

        logicalBytes += result.size;
        for (const blob of result.blobs) blobHashes.add(blob);
        if (result.path.startsWith('saves/')) hasWorlds = true;

        if (issues.length > 200) {
            issues.push({ path: 'entries', reason: 'too many issues, validation stopped' });
            break;
        }
    }

    if (manifest.icon && typeof manifest.icon.blob === 'string' && SHA256_RE.test(manifest.icon.blob)) {
        blobHashes.add(manifest.icon.blob);
    }

    return {
        valid: issues.length === 0,
        issues,
        stats: {
            entryCount: manifest.entries.length,
            logicalBytes,
            hasWorlds,
            blobHashes: [...blobHashes]
        }
    };
}

module.exports = {
    CHUNK_ALGORITHMS,
    MANIFEST_VERSION,
    MAX_ENTRIES,
    validRelPath,
    validSegment,
    validateManifest
};
