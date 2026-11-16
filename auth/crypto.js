// Password hashing (scrypt), TOTP (RFC 6238), one-time tokens and secret encryption.
// Only node:crypto, no extra dependency.

const crypto = require('crypto');

// ── passwords ───────────────────────────────────────────────────────────────

const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64 };

function scrypt(password, salt, params) {
    return new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, params.keylen, {
            N: params.N, r: params.r, p: params.p, maxmem: 128 * params.N * params.r * 2,
        }, (err, key) => (err ? reject(err) : resolve(key)));
    });
}

// Format: scrypt$N$r$p$salt$hash (base64url)
async function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const key = await scrypt(String(password).normalize('NFKC'), salt, SCRYPT);
    return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

async function verifyPassword(password, stored) {
    if (typeof stored !== 'string' || !stored.startsWith('scrypt$')) return false;
    const [, N, r, p, saltB64, hashB64] = stored.split('$');
    const expected = Buffer.from(hashB64 || '', 'base64url');
    if (!expected.length) return false;
    const key = await scrypt(String(password).normalize('NFKC'), Buffer.from(saltB64, 'base64url'), {
        N: Number(N), r: Number(r), p: Number(p), keylen: expected.length,
    });
    return crypto.timingSafeEqual(key, expected);
}

// Spend the same time as a real check when the account doesn't exist.
let dummyHash = null;
async function burnPasswordCheck(password) {
    if (!dummyHash) dummyHash = await hashPassword('lux-dummy-password');
    await verifyPassword(password, dummyHash);
    return false;
}

// ── tokens ──────────────────────────────────────────────────────────────────

function randomToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString('base64url');
}

function sha256(value) {
    return crypto.createHash('sha256').update(String(value)).digest('hex');
}

// ── secret encryption (TOTP secrets at rest) ────────────────────────────────

function encryptionKey() {
    const source = process.env.AUTH_SECRET || process.env.SESSION_SECRET || 'mclc-super-secret-session-key-2026';
    return crypto.createHash('sha256').update(`lux-auth:${source}`).digest();
}

function encrypt(plain) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
    const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${data.toString('base64url')}`;
}

function decrypt(value) {
    if (typeof value !== 'string' || !value.startsWith('v1.')) return null;
    try {
        const [, iv, tag, data] = value.split('.');
        const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
        decipher.setAuthTag(Buffer.from(tag, 'base64url'));
        return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
    } catch {
        return null;
    }
}

// ── TOTP ────────────────────────────────────────────────────────────────────

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
    let bits = 0, value = 0, out = '';
    for (const byte of buf) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            out += B32[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) out += B32[(value << (5 - bits)) & 31];
    return out;
}

function base32Decode(str) {
    const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
    let bits = 0, value = 0;
    const out = [];
    for (const ch of clean) {
        value = (value << 5) | B32.indexOf(ch);
        bits += 5;
        if (bits >= 8) {
            out.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return Buffer.from(out);
}

function generateTotpSecret() {
    return base32Encode(crypto.randomBytes(20));
}

function hotp(secret, counter) {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(BigInt(counter));
    const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000;
    return String(code).padStart(6, '0');
}

function totpAt(secret, timeMs = Date.now()) {
    return hotp(secret, Math.floor(timeMs / 30000));
}

// Returns the matched time step (to block reuse), or null. Accepts one step of clock drift.
function verifyTotp(secret, code, { lastStep = null, timeMs = Date.now() } = {}) {
    const clean = String(code || '').replace(/\s+/g, '');
    if (!/^\d{6}$/.test(clean)) return null;
    const step = Math.floor(timeMs / 30000);
    for (const s of [step, step - 1, step + 1]) {
        if (lastStep !== null && s <= Number(lastStep)) continue;
        const expected = hotp(secret, s);
        if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return s;
    }
    return null;
}

function totpUri({ secret, account, issuer = 'Lux Client' }) {
    const label = encodeURIComponent(`${issuer}:${account}`);
    return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// Recovery codes like "k7f3-9xq2", shown once.
function generateRecoveryCodes(count = 10) {
    const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
    const codes = [];
    for (let i = 0; i < count; i++) {
        let raw = '';
        for (let j = 0; j < 8; j++) raw += alphabet[crypto.randomInt(alphabet.length)];
        codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
    }
    return codes;
}

function normalizeRecoveryCode(code) {
    return String(code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

module.exports = {
    hashPassword,
    verifyPassword,
    burnPasswordCheck,
    randomToken,
    sha256,
    encrypt,
    decrypt,
    base32Encode,
    base32Decode,
    generateTotpSecret,
    totpAt,
    verifyTotp,
    totpUri,
    generateRecoveryCodes,
    normalizeRecoveryCode,
};
