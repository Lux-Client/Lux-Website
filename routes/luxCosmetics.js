/* Lux Client mod: cosmetics API and cape marketplace.

   - The mod signs in with its Minecraft account the same way a server checks a
     joining player (random serverId -> Mojang joinServer -> we ask Mojang hasJoined),
     then pushes its cape and name style and asks which players around it use Lux.
   - The website side uses the normal website account (Google sign-in): upload capes
     to the marketplace, link a Minecraft account, put a cape on.
   - Moderation: every uploaded picture (marketplace or a player's own picture from the
     mod) stays private until an admin approves it in the admin panel. Other players
     only ever receive approved pictures. */

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { rateLimit } = require('express-rate-limit');
const pool = require('../database');
const shop = require('../luxShop');

const TOKEN_DAYS = 30;
/** How long a player counts as "playing with Lux" (the mod pings every 2 minutes). */
const ONLINE_MS = 10 * 60 * 1000;
const LINK_CODE_MS = 10 * 60 * 1000;
const MAX_IMAGE_BYTES = 1024 * 1024;
const MAX_IMAGE_SIDE = 2048;
const MAX_CAPES_PER_USER = 20;
const MAX_PENDING_PER_USER = 5;
const PAGE_SIZE = 36;
const CAPE_STYLES = 7; // built-in animated patterns 0..6 in the mod
const COSMETIC_SLOTS = ['head', 'ears', 'face', 'neck', 'shoulder', 'back', 'wings', 'tail', 'aura'];
/** Custom second line under the name. */
const LINE_MAX = 32;
const ID_RE = /^[a-z0-9_]{1,32}$/;
/** An emote is forgotten after this long (looping emotes are stopped by the mod). */
const EMOTE_MS = 10 * 60 * 1000;

const UUID_RE = /^[0-9a-f]{32}$/;
const HASH_RE = /^[0-9a-f]{64}$/;

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const now = () => Date.now();
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const cleanUuid = (v) => (typeof v === 'string' ? v.replace(/-/g, '').toLowerCase() : '');

/** Minecraft name -> { uuid, name } (for admins giving credits to someone who never used Lux). */
async function mojangLookup(name) {
    const res = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`,
        { signal: AbortSignal.timeout(8000) });
    if (res.status !== 200) return null;
    const body = await res.json().catch(() => null);
    if (!body || typeof body.id !== 'string' || typeof body.name !== 'string') return null;
    return { uuid: body.id.toLowerCase(), name: body.name };
}

async function mojangHasJoined(name, serverId) {
    const base = process.env.MOJANG_SESSION_URL || 'https://sessionserver.mojang.com';
    const url = `${base}/session/minecraft/hasJoined?username=${encodeURIComponent(name)}&serverId=${encodeURIComponent(serverId)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.status !== 200) return null;
    const body = await res.json().catch(() => null);
    if (!body || typeof body.id !== 'string' || typeof body.name !== 'string') return null;
    return { uuid: body.id.toLowerCase(), name: body.name };
}

/** Validates a PNG and re-encodes it (drops metadata and anything hidden in extra chunks). */
async function normalizePng(buf) {
    if (!Buffer.isBuffer(buf) || buf.length === 0) throw new HttpError(400, 'Please send a PNG picture.');
    const sharp = require('sharp');
    let meta;
    try {
        meta = await sharp(buf).metadata();
    } catch {
        throw new HttpError(400, 'That is not a valid PNG picture.');
    }
    if (meta.format !== 'png') throw new HttpError(400, 'Only PNG pictures are allowed.');
    if (!meta.width || !meta.height || meta.width < 8 || meta.height < 8
        || meta.width > MAX_IMAGE_SIDE || meta.height > MAX_IMAGE_SIDE) {
        throw new HttpError(400, `The picture must be between 8x8 and ${MAX_IMAGE_SIDE}x${MAX_IMAGE_SIDE} pixels.`);
    }
    const out = await sharp(buf).png({ compressionLevel: 9 }).toBuffer();
    return { buf: out, width: meta.width, height: meta.height };
}

function createLuxRouter(options = {}) {
    const hasJoined = options.hasJoined || mojangHasJoined;
    const lookupName = options.lookupName || mojangLookup;
    const allowOffline = options.allowOffline ?? process.env.LUX_ALLOW_OFFLINE === 'true';
    const imageDir = options.imageDir || path.join(
        process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data'),
        'lux-capes'
    );
    fs.mkdirSync(imageDir, { recursive: true });

    /** serverId -> { name, expires } while a mod sign-in is running */
    const challenges = new Map();
    /** link code -> { uuid, expires } */
    const linkCodes = new Map();
    /** uuid -> { id, started, partner } - emotes only live in memory, they are over in seconds */
    const emotes = new Map();
    /** uuid -> { rev, seen }: who plays with Lux right now and when the profile last changed. */
    const live = new Map();
    /** uuid -> time until which "not a Lux player" is believed (saves database lookups). */
    const missing = new Map();

    function touch(uuid, rev) {
        const e = live.get(uuid) || { rev: 0, seen: 0 };
        e.seen = now();
        if (rev !== undefined && rev !== null) e.rev = Number(rev);
        live.set(uuid, e);
        missing.delete(uuid);
    }

    const router = express.Router();
    const rawPng = express.raw({ type: () => true, limit: MAX_IMAGE_BYTES });

    const limiter = (limit) => rateLimit({
        windowMs: 60 * 1000,
        limit,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => res.status(429).json({ error: 'Too many requests - please wait a moment.' })
    });
    const authLimiter = limiter(30);
    const liveLimiter = limiter(150);
    const writeLimiter = limiter(60);
    const uploadLimiter = limiter(10);

    const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

    // ------------------------------------------------------------------ helpers

    async function issueToken(uuid) {
        const token = crypto.randomBytes(32).toString('hex');
        await pool.query('INSERT INTO lux_tokens (token_hash, uuid, expires) VALUES (?, ?, ?) RETURNING uuid',
            [sha256(token), uuid, now() + TOKEN_DAYS * 86400000]);
        return token;
    }

    /** The Minecraft player behind the mod's bearer token, or null. */
    async function modPlayer(req) {
        const header = req.get('authorization') || '';
        if (!header.startsWith('Bearer ')) return null;
        const token = header.slice(7).trim();
        if (!/^[0-9a-f]{64}$/.test(token)) return null;
        const [rows] = await pool.query(
            'SELECT p.* FROM lux_tokens t JOIN lux_players p ON p.uuid = t.uuid WHERE t.token_hash = ? AND t.expires > ?',
            [sha256(token), now()]
        );
        return rows[0] || null;
    }

    async function requireMod(req) {
        const player = await modPlayer(req);
        if (!player) throw new HttpError(401, 'Not signed in.');
        return player;
    }

    function webUser(req) {
        return typeof req.isAuthenticated === 'function' && req.isAuthenticated() ? req.user : null;
    }

    function requireWeb(req) {
        const user = webUser(req);
        if (!user) throw new HttpError(401, 'Please sign in first.');
        if (user.banned) throw new HttpError(403, 'Your account is banned.');
        return user;
    }

    function requireAdmin(req) {
        const user = webUser(req);
        if (!user || user.role !== 'admin') throw new HttpError(403, 'Forbidden');
        return user;
    }

    async function audit(admin, action, targetType, targetId, details = null) {
        try {
            await pool.query(
                'INSERT INTO admin_audit_log (admin_user_id, admin_label, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?)',
                [admin.id, admin.username, action, targetType, String(targetId), details]
            );
        } catch (err) {
            console.error('[LuxCosmetics] Failed to write audit log:', err.message);
        }
    }

    async function notify(userId, message, type) {
        if (!userId) return;
        try {
            await pool.query('INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)', [userId, message, type]);
        } catch (err) {
            console.error('[LuxCosmetics] Failed to send notification:', err.message);
        }
    }

    async function imageRow(hash) {
        const [rows] = await pool.query('SELECT * FROM lux_cape_images WHERE hash = ?', [hash]);
        return rows[0] || null;
    }

    /** Stores a picture (file name = sha256). A picture that was rejected once stays rejected. */
    async function storeImage(buf, { ownerUuid = null, ownerUserId = null } = {}) {
        const img = await normalizePng(buf);
        const hash = sha256(img.buf);
        const file = path.join(imageDir, `${hash}.png`);
        if (!fs.existsSync(file)) fs.writeFileSync(file, img.buf);
        let row = await imageRow(hash);
        if (!row) {
            await pool.query(
                'INSERT INTO lux_cape_images (hash, width, height, status, owner_uuid, owner_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING hash',
                [hash, img.width, img.height, 'pending', ownerUuid, ownerUserId, now()]
            );
            row = await imageRow(hash);
        }
        return row;
    }

    async function uploadedBy(hash, uuid) {
        if (!uuid) return false;
        const [rows] = await pool.query('SELECT hash FROM lux_image_uploads WHERE hash = ? AND uuid = ?', [hash, uuid]);
        return rows.length > 0;
    }

    async function approvedHashes(hashes) {
        const list = [...new Set(hashes.filter((h) => HASH_RE.test(h)))];
        if (list.length === 0) return new Set();
        const [rows] = await pool.query(
            `SELECT hash FROM lux_cape_images WHERE status = 'approved' AND hash IN (${list.map(() => '?').join(',')})`,
            list
        );
        return new Set(rows.map((r) => r.hash));
    }

    function parse(text) {
        if (!text) return null;
        try {
            return JSON.parse(text);
        } catch {
            return null;
        }
    }

    /** What other players get to see: pictures only once approved. */
    function publicCape(cape, approved) {
        if (!cape) return null;
        if (cape.type === 'image' && !approved.has(cape.hash)) return null;
        return cape;
    }

    async function ownedSet(uuid) {
        const [rows] = await pool.query('SELECT item FROM lux_owned WHERE uuid = ?', [uuid]);
        return new Set(rows.map((r) => r.item));
    }

    const owns = (owned, item) => shop.isFree(item) || owned.has(item);

    function cleanLine(text) {
        if (typeof text !== 'string') return '';
        // no colour codes, no control characters, single spaces
        return text.replace(/§./g, '').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').replace(/\s+/g, ' ')
            .trim().slice(0, LINE_MAX);
    }

    async function cleanCape(c, player) {
        if (c === null || c === undefined) return null;
        if (typeof c !== 'object') throw new HttpError(400, 'Invalid cape.');
        const color = (v) => (isInt(v, 0, 0xffffff) ? v : 0);
        switch (c.type) {
            case 'style':
                if (!isInt(c.style, 0, CAPE_STYLES - 1)) throw new HttpError(400, 'Invalid cape pattern.');
                return { type: 'style', style: c.style, c1: color(c.c1), c2: color(c.c2), speed: isInt(c.speed, 10, 300) ? c.speed : 100 };
            case 'painted':
                if (!Array.isArray(c.pixels) || c.pixels.length !== 160 || !c.pixels.every((v) => isInt(v, 0, 0xffffff))) {
                    throw new HttpError(400, 'Invalid painted cape.');
                }
                return { type: 'painted', pixels: c.pixels };
            case 'image': {
                if (typeof c.hash !== 'string' || !HASH_RE.test(c.hash)) throw new HttpError(400, 'Invalid picture.');
                const img = await imageRow(c.hash);
                if (!img) throw new HttpError(400, 'Picture not found - upload it first.');
                // Your own picture or an approved one; nobody can wear someone else's unreviewed upload.
                if (img.status !== 'approved' && img.owner_uuid !== player.uuid && !(await uploadedBy(img.hash, player.uuid))) {
                    throw new HttpError(400, 'This picture has not been approved yet.');
                }
                return c.market ? { type: 'image', hash: c.hash, market: Number(c.market) || undefined } : { type: 'image', hash: c.hash };
            }
            case 'market': {
                const [rows] = isInt(c.id, 1, 2 ** 31 - 1)
                    ? await pool.query("SELECT id, image_hash FROM lux_capes WHERE id = ? AND status = 'approved'", [c.id])
                    : [[]];
                if (!rows[0]) throw new HttpError(400, 'Cape not found in the marketplace.');
                return { type: 'image', hash: rows[0].image_hash, market: rows[0].id };
            }
            default:
                throw new HttpError(400, 'Unknown cape type.');
        }
    }

    /** Name style; whatever is not unlocked falls back to the plain variant. */
    function cleanNameStyle(s, owned, warnings = []) {
        if (s === null || s === undefined) return null;
        if (typeof s !== 'object' || !isInt(s.color, 0, 7) || !isInt(s.animation, 0, 4)) {
            throw new HttpError(400, 'Invalid name style.');
        }
        const out = {
            color: s.color,
            c1: isInt(s.c1, 0, 0xffffff) ? s.c1 : 0xffaa00,
            c2: isInt(s.c2, 0, 0xffffff) ? s.c2 : 0xff55ff,
            speed: isInt(s.speed, 10, 400) ? s.speed : 100,
            animation: s.animation,
            bold: s.bold === true
        };
        if (out.color && !owns(owned, `name:color:${out.color}`)) {
            warnings.push(`nameStyle: colour ${out.color} is not unlocked`);
            out.color = 0;
        }
        if (out.animation && !owns(owned, `name:anim:${out.animation}`)) {
            warnings.push(`nameStyle: animation ${out.animation} is not unlocked`);
            out.animation = 0;
        }
        if (out.bold && !owns(owned, 'name:bold')) {
            warnings.push('nameStyle: bold is not unlocked');
            out.bold = false;
        }
        const line = cleanLine(s.line);
        if (line) {
            if (owns(owned, 'name:line')) out.line = line;
            else warnings.push('nameStyle: the second line is not unlocked');
        }
        return out;
    }

    /** Hats, wings, tails ...: one cosmetic per slot, only what the player unlocked. */
    function cleanCosmetics(c, owned, warnings = []) {
        if (c === null || c === undefined) return null;
        if (typeof c !== 'object' || Array.isArray(c)) throw new HttpError(400, 'Invalid cosmetics.');
        const out = {};
        for (const slot of COSMETIC_SLOTS) {
            const e = c[slot];
            if (e === undefined || e === null) continue;
            if (typeof e !== 'object' || typeof e.id !== 'string' || !ID_RE.test(e.id)) {
                throw new HttpError(400, 'Invalid cosmetic.');
            }
            if (!owns(owned, `cosmetic:${e.id}`)) {
                warnings.push(`cosmetics: ${e.id} is not unlocked`);
                continue;
            }
            const clean = { id: e.id };
            if (isInt(e.color, 0, 0xffffff)) clean.color = e.color;
            if (e.rainbow === true) clean.rainbow = true;
            out[slot] = clean;
        }
        return out;
    }

    /** The mod's own view: includes the review state of its own picture. */
    async function ownProfile(uuid) {
        const [rows] = await pool.query(
            'SELECT p.*, u.username AS linked FROM lux_players p LEFT JOIN users u ON u.id = p.user_id WHERE p.uuid = ?',
            [uuid]
        );
        const p = rows[0];
        const cape = parse(p.cape);
        let capeReview = null;
        if (cape && cape.type === 'image') {
            const img = await imageRow(cape.hash);
            capeReview = img ? img.status : 'pending';
        }
        return {
            uuid: p.uuid, name: p.name, cape, nameStyle: parse(p.name_style),
            cosmetics: parse(p.cosmetics), capeReview, linked: p.linked || null,
            credits: Number(p.credits || 0), rev: Number(p.rev || 0)
        };
    }

    function listing(row) {
        return {
            id: row.id,
            title: row.title,
            hash: row.image_hash,
            author: row.author || 'Unknown',
            uses: Number(row.uses || 0),
            created: Number(row.created_at || 0),
            image: `/api/lux/images/${row.image_hash}.png`
        };
    }

    // ------------------------------------------------------------------ mod: sign-in

    router.get('/health', (req, res) => res.json({ ok: true }));

    router.post('/auth/start', authLimiter, wrap(async (req, res) => {
        const name = req.body && req.body.name;
        if (typeof name !== 'string' || !/^[A-Za-z0-9_]{1,16}$/.test(name)) throw new HttpError(400, 'Invalid name.');
        const serverId = crypto.randomBytes(16).toString('hex');
        challenges.set(serverId, { name, expires: now() + 120000 });
        res.json({ serverId });
    }));

    router.post('/auth/finish', authLimiter, wrap(async (req, res) => {
        const body = req.body || {};
        const ch = typeof body.serverId === 'string' ? challenges.get(body.serverId) : null;
        if (!ch || ch.expires < now()) throw new HttpError(400, 'Sign-in expired - please try again.');
        challenges.delete(body.serverId);
        let profile = await hasJoined(ch.name, body.serverId).catch(() => null);
        if (!profile && allowOffline && UUID_RE.test(cleanUuid(body.uuid))) {
            // Testing only (LUX_ALLOW_OFFLINE=true): skip the Mojang check.
            profile = { uuid: cleanUuid(body.uuid), name: ch.name };
        }
        if (!profile) throw new HttpError(403, 'Mojang did not confirm the sign-in.');
        const t = now();
        await pool.query(
            `INSERT INTO lux_players (uuid, name, last_seen, created_at) VALUES (?, ?, ?, ?)
             ON CONFLICT (uuid) DO UPDATE SET name = EXCLUDED.name, last_seen = EXCLUDED.last_seen RETURNING uuid`,
            [profile.uuid, profile.name, t, t]
        );
        const [revRows] = await pool.query('SELECT rev FROM lux_players WHERE uuid = ?', [profile.uuid]);
        touch(profile.uuid, revRows[0] ? revRows[0].rev : 0);
        res.json({ token: await issueToken(profile.uuid), uuid: profile.uuid, name: profile.name });
    }));

    // ------------------------------------------------------------------ mod: own profile

    router.get('/me', wrap(async (req, res) => {
        const p = await requireMod(req);
        res.json(await ownProfile(p.uuid));
    }));

    router.put('/me/profile', writeLimiter, wrap(async (req, res) => {
        const p = await requireMod(req);
        const body = req.body || {};
        const fields = [];
        const values = [];
        const warnings = [];
        // One bad part (e.g. a cape picture that was rejected) must not throw away the rest.
        const owned = await ownedSet(p.uuid);
        const take = async (key, column, clean) => {
            if (!(key in body)) return;
            let value = null;
            try {
                value = await clean(body[key]);
            } catch (err) {
                if (!(err instanceof HttpError)) throw err;
                warnings.push(`${key}: ${err.message}`);
            }
            fields.push(`${column} = ?`);
            values.push(value ? JSON.stringify(value) : null);
        };
        await take('cape', 'cape', (c) => cleanCape(c, p));
        await take('nameStyle', 'name_style', (s) => cleanNameStyle(s, owned, warnings));
        await take('cosmetics', 'cosmetics', (c) => cleanCosmetics(c, owned, warnings));
        // Did anything others see change? Then raise rev so their clients fetch it right away.
        const before = [p.cape, p.name_style, p.cosmetics];
        const t = now();
        let rev = Number(p.rev || 0);
        const changed = fields.some((f, i) => {
            const col = f.split(' ')[0];
            const old = col === 'cape' ? before[0] : col === 'name_style' ? before[1] : before[2];
            return (old || null) !== (values[i] || null);
        });
        if (changed) {
            rev = Math.max(t, rev + 1);
            fields.push('rev = ?');
            values.push(rev);
        }
        fields.push('last_seen = ?');
        values.push(t);
        await pool.query(`UPDATE lux_players SET ${fields.join(', ')} WHERE uuid = ?`, [...values, p.uuid]);
        touch(p.uuid, rev);
        const profile = await ownProfile(p.uuid);
        if (warnings.length) profile.warnings = warnings;
        res.json(profile);
    }));

    router.post('/me/ping', wrap(async (req, res) => {
        const p = await requireMod(req);
        await pool.query('UPDATE lux_players SET last_seen = ? WHERE uuid = ?', [now(), p.uuid]);
        touch(p.uuid);
        res.json({ ok: true });
    }));

    // The player's own picture from the mod. Others see it after an admin approved it.
    router.put('/me/cape-image', uploadLimiter, rawPng, wrap(async (req, res) => {
        const p = await requireMod(req);
        const img = await storeImage(req.body, { ownerUuid: p.uuid, ownerUserId: p.user_id || null });
        await pool.query(
            'INSERT INTO lux_image_uploads (hash, uuid) VALUES (?, ?) ON CONFLICT (hash, uuid) DO NOTHING RETURNING hash',
            [img.hash, p.uuid]
        );
        res.json({ hash: img.hash, width: img.width, height: img.height, status: img.status });
    }));

    // One-time code: opens the website, which links this Minecraft account to the website account.
    router.post('/me/link-code', writeLimiter, wrap(async (req, res) => {
        const p = await requireMod(req);
        const code = crypto.randomBytes(6).toString('hex').toUpperCase();
        linkCodes.set(code, { uuid: p.uuid, expires: now() + LINK_CODE_MS });
        res.json({ code, url: `/capes?link=${code}` });
    }));

    // ------------------------------------------------------------------ mod: other players

    router.get('/players', wrap(async (req, res) => {
        const uuids = String(req.query.uuids || '')
            .split(',')
            .map(cleanUuid)
            .filter((u) => UUID_RE.test(u))
            .slice(0, 200);
        const out = {};
        if (uuids.length) {
            const [rows] = await pool.query(
                `SELECT uuid, name, cape, name_style, cosmetics, rev FROM lux_players WHERE last_seen > ? AND uuid IN (${uuids.map(() => '?').join(',')})`,
                [now() - ONLINE_MS, ...uuids]
            );
            const capes = rows.map((r) => parse(r.cape));
            const approved = await approvedHashes(capes.filter((c) => c && c.type === 'image').map((c) => c.hash));
            rows.forEach((r, i) => {
                out[r.uuid] = {
                    name: r.name,
                    cape: publicCape(capes[i], approved),
                    nameStyle: parse(r.name_style),
                    cosmetics: parse(r.cosmetics),
                    rev: Number(r.rev || 0)
                };
            });
        }
        // Never cache: a changed cape or name has to show up right away.
        res.set('Cache-Control', 'no-store');
        res.json({ players: out });
    }));

    // Emotes: start/stop your own, ask for the players around you (polled about once a second).
    router.post('/me/emote', writeLimiter, wrap(async (req, res) => {
        const p = await requireMod(req);
        const id = req.body && req.body.emote;
        if (id === null || id === undefined) {
            emotes.delete(p.uuid);
        } else if (typeof id === 'string' && ID_RE.test(id)) {
            const partner = cleanUuid(req.body.partner);
            // Joining somebody's partner emote is free - only starting one needs it unlocked.
            const partnerEmote = UUID_RE.test(partner) ? emotes.get(partner) : null;
            const joining = partnerEmote && partnerEmote.id === id && !partnerEmote.partner;
            if (!joining && !owns(await ownedSet(p.uuid), `emote:${id}`)) throw new HttpError(403, 'This emote is not unlocked.');
            emotes.set(p.uuid, { id, started: now(), partner: UUID_RE.test(partner) ? partner : null });
        } else {
            throw new HttpError(400, 'Invalid emote.');
        }
        touch(p.uuid);
        res.json({ ok: true });
    }));

    router.get('/emotes', (req, res) => {
        const t = now();
        const out = {};
        for (const u of String(req.query.uuids || '').split(',').map(cleanUuid).filter((u) => UUID_RE.test(u)).slice(0, 200)) {
            const e = emotes.get(u);
            if (e && t - e.started < EMOTE_MS) out[u] = { id: e.id, age: t - e.started };
        }
        res.set('Cache-Control', 'no-store');
        res.json({ emotes: out });
    });

    /**
     * Polled by the mod about every 1.5 s with the players in its tab list: who uses Lux, when their
     * profile last changed (rev - the mod refetches only then) and which emote they are doing.
     * Answered from memory; the database is only asked about players never seen before.
     */
    router.post('/live', liveLimiter, wrap(async (req, res) => {
        const list = Array.isArray(req.body && req.body.uuids) ? req.body.uuids : [];
        const uuids = [...new Set(list.map(cleanUuid).filter((u) => UUID_RE.test(u)))].slice(0, 300);
        const t = now();
        const unknown = uuids.filter((u) => !live.has(u) && !((missing.get(u) || 0) > t));
        if (unknown.length) {
            const [rows] = await pool.query(
                `SELECT uuid, rev, last_seen FROM lux_players WHERE uuid IN (${unknown.map(() => '?').join(',')})`,
                unknown
            );
            const found = new Set();
            for (const r of rows) {
                if (Number(r.last_seen) > t - ONLINE_MS) {
                    live.set(r.uuid, { rev: Number(r.rev || 0), seen: Number(r.last_seen) });
                    found.add(r.uuid);
                }
            }
            for (const u of unknown) if (!found.has(u)) missing.set(u, t + 20000);
        }
        const out = {};
        for (const u of uuids) {
            const e = live.get(u);
            if (!e || t - e.seen > ONLINE_MS) continue;
            const o = { rev: e.rev };
            const em = emotes.get(u);
            if (em && t - em.started < EMOTE_MS) o.emote = { id: em.id, age: t - em.started, partner: em.partner || null };
            out[u] = o;
        }
        res.set('Cache-Control', 'no-store');
        res.json({ players: out, now: t });
    }));

    // ------------------------------------------------------------------ mod: Lux Credits shop

    router.get('/shop', wrap(async (req, res) => {
        const p = await requireMod(req);
        res.json({ credits: Number(p.credits || 0), prices: shop.PRICES, owned: [...(await ownedSet(p.uuid))] });
    }));

    async function logCredits(uuid, delta, balance, reason, actor) {
        await pool.query(
            'INSERT INTO lux_credit_log (uuid, delta, balance, reason, actor, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [uuid, delta, balance, reason ? String(reason).slice(0, 200) : null, actor || null, now()]
        );
    }

    router.post('/shop/buy', writeLimiter, wrap(async (req, res) => {
        const p = await requireMod(req);
        const item = String((req.body && req.body.item) || '');
        const pr = shop.ITEM_RE.test(item) ? shop.price(item) : null;
        if (pr === null) throw new HttpError(404, 'This is not for sale.');
        const owned = await ownedSet(p.uuid);
        if (owns(owned, item)) throw new HttpError(400, 'You already own this.');
        // Atomic: only takes the credits if there are enough.
        const [upd] = await pool.query(
            'UPDATE lux_players SET credits = credits + ? WHERE uuid = ? AND credits >= ? RETURNING credits',
            [-pr, p.uuid, pr]
        );
        if (!upd.rows || upd.rows.length === 0) throw new HttpError(400, 'Not enough Lux Credits.');
        const [ins] = await pool.query(
            'INSERT INTO lux_owned (uuid, item, price, source, acquired_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (uuid, item) DO NOTHING RETURNING uuid',
            [p.uuid, item, pr, 'shop', now()]
        );
        let credits = Number(upd.rows[0].credits);
        if (!ins.rows || ins.rows.length === 0) {
            // bought twice at the same moment - give the credits back
            const [back] = await pool.query('UPDATE lux_players SET credits = credits + ? WHERE uuid = ? RETURNING credits', [pr, p.uuid]);
            credits = Number(back.rows[0].credits);
        } else {
            await logCredits(p.uuid, -pr, credits, `bought ${item}`, 'shop');
        }
        owned.add(item);
        res.json({ ok: true, credits, owned: [...owned] });
    }));

    // Pictures: approved ones for everybody, others only for the uploader and admins.
    router.get('/images/:file', wrap(async (req, res) => {
        const m = /^([0-9a-f]{64})\.png$/.exec(req.params.file);
        if (!m) throw new HttpError(404, 'Not found.');
        const img = await imageRow(m[1]);
        const file = path.join(imageDir, `${m[1]}.png`);
        if (!img || !fs.existsSync(file)) throw new HttpError(404, 'Not found.');
        if (img.status !== 'approved') {
            const user = webUser(req);
            let allowed = user && (user.role === 'admin' || user.id === img.owner_user_id);
            if (!allowed && user) {
                const [own] = await pool.query('SELECT id FROM lux_capes WHERE image_hash = ? AND user_id = ?', [img.hash, user.id]);
                allowed = own.length > 0;
            }
            if (!allowed) {
                const p = await modPlayer(req);
                allowed = p && (p.uuid === img.owner_uuid || (await uploadedBy(img.hash, p.uuid)));
            }
            if (!allowed) throw new HttpError(404, 'Not found.');
            res.set('Cache-Control', 'private, no-store');
        } else {
            res.set('Cache-Control', 'public, max-age=86400');
        }
        res.set('Content-Type', 'image/png');
        res.set('X-Content-Type-Options', 'nosniff');
        res.set('Content-Security-Policy', "default-src 'none'");
        res.sendFile(file);
    }));

    // ------------------------------------------------------------------ website: account link

    router.get('/account', wrap(async (req, res) => {
        const user = requireWeb(req);
        const [rows] = await pool.query(
            'SELECT uuid, name, cape, last_seen FROM lux_players WHERE user_id = ? ORDER BY name',
            [user.id]
        );
        res.json({
            players: rows.map((r) => ({ uuid: r.uuid, name: r.name, cape: parse(r.cape), lastSeen: Number(r.last_seen || 0) }))
        });
    }));

    router.post('/account/link', writeLimiter, wrap(async (req, res) => {
        const user = requireWeb(req);
        const code = String((req.body && req.body.code) || '').trim().toUpperCase();
        const entry = linkCodes.get(code);
        if (!entry || entry.expires < now()) {
            throw new HttpError(400, 'This link has expired - open it again from the game (Lux Account module).');
        }
        linkCodes.delete(code);
        await pool.query('UPDATE lux_players SET user_id = ? WHERE uuid = ?', [user.id, entry.uuid]);
        // Pictures uploaded from the game before linking now belong to this account too.
        await pool.query('UPDATE lux_cape_images SET owner_user_id = ? WHERE owner_uuid = ? AND owner_user_id IS NULL', [user.id, entry.uuid]);
        const [rows] = await pool.query('SELECT uuid, name FROM lux_players WHERE uuid = ?', [entry.uuid]);
        res.json({ ok: true, player: rows[0] });
    }));

    router.delete('/account/players/:uuid', writeLimiter, wrap(async (req, res) => {
        const user = requireWeb(req);
        await pool.query('UPDATE lux_players SET user_id = NULL WHERE uuid = ? AND user_id = ?', [cleanUuid(req.params.uuid), user.id]);
        res.json({ ok: true });
    }));

    // ------------------------------------------------------------------ website: marketplace

    router.get('/capes', wrap(async (req, res) => {
        const sort = req.query.sort === 'top' ? 'c.uses DESC, c.id DESC' : 'c.id DESC';
        const q = String(req.query.q || '').trim().slice(0, 40).toLowerCase();
        const page = Math.max(0, Math.min(1000, parseInt(req.query.page, 10) || 0));
        const args = [];
        let where = "c.status = 'approved'";
        if (q) {
            where += ' AND (LOWER(c.title) LIKE ? OR LOWER(u.username) LIKE ?)';
            args.push(`%${q}%`, `%${q}%`);
        }
        const [rows] = await pool.query(
            `SELECT c.*, u.username AS author FROM lux_capes c LEFT JOIN users u ON u.id = c.user_id
             WHERE ${where} ORDER BY ${sort} LIMIT ${PAGE_SIZE + 1} OFFSET ${page * PAGE_SIZE}`,
            args
        );
        res.json({ items: rows.slice(0, PAGE_SIZE).map(listing), page, more: rows.length > PAGE_SIZE });
    }));

    router.get('/capes/mine', wrap(async (req, res) => {
        const user = requireWeb(req);
        const [rows] = await pool.query(
            'SELECT c.*, u.username AS author FROM lux_capes c LEFT JOIN users u ON u.id = c.user_id WHERE c.user_id = ? ORDER BY c.id DESC',
            [user.id]
        );
        res.json({ items: rows.map((r) => ({ ...listing(r), status: r.status, reason: r.reject_reason || null })) });
    }));

    router.get('/capes/:id', wrap(async (req, res) => {
        const id = parseInt(req.params.id, 10);
        const [rows] = await pool.query(
            "SELECT c.*, u.username AS author FROM lux_capes c LEFT JOIN users u ON u.id = c.user_id WHERE c.id = ? AND c.status = 'approved'",
            [Number.isFinite(id) ? id : 0]
        );
        if (!rows[0]) throw new HttpError(404, 'Not found.');
        res.json(listing(rows[0]));
    }));

    // Upload: PNG as the request body, title as ?title=. Goes into the review queue.
    router.post('/capes', uploadLimiter, rawPng, wrap(async (req, res) => {
        const user = requireWeb(req);
        const title = String(req.query.title || '').trim().replace(/\s+/g, ' ').slice(0, 40);
        if (title.length < 2) throw new HttpError(400, 'Please give the cape a name (at least 2 characters).');
        const [[counts]] = await pool.query(
            "SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending FROM lux_capes WHERE user_id = ?",
            [user.id]
        );
        if (Number(counts.total || 0) >= MAX_CAPES_PER_USER) {
            throw new HttpError(400, `You already have ${MAX_CAPES_PER_USER} capes - delete one first.`);
        }
        if (Number(counts.pending || 0) >= MAX_PENDING_PER_USER) {
            throw new HttpError(400, `You already have ${MAX_PENDING_PER_USER} capes waiting for review - please wait until they are checked.`);
        }
        const img = await storeImage(req.body, { ownerUserId: user.id });
        if (img.status === 'rejected') throw new HttpError(400, 'This picture was rejected by the moderators.');
        const [result] = await pool.query(
            'INSERT INTO lux_capes (user_id, title, image_hash, status, created_at) VALUES (?, ?, ?, ?, ?)',
            [user.id, title, img.hash, 'pending', now()]
        );
        res.status(201).json({
            ...listing({ id: result.insertId, title, image_hash: img.hash, author: user.username, uses: 0, created_at: now() }),
            status: 'pending'
        });
    }));

    // Put a marketplace cape on the linked Minecraft account(s).
    router.post('/capes/:id/use', writeLimiter, wrap(async (req, res) => {
        const user = requireWeb(req);
        const [rows] = await pool.query("SELECT * FROM lux_capes WHERE id = ? AND status = 'approved'", [parseInt(req.params.id, 10) || 0]);
        const cape = rows[0];
        if (!cape) throw new HttpError(404, 'Not found.');
        const [players] = await pool.query('SELECT uuid FROM lux_players WHERE user_id = ?', [user.id]);
        const wanted = cleanUuid(req.body && req.body.uuid);
        const targets = players.filter((p) => !wanted || p.uuid === wanted);
        if (targets.length === 0) {
            throw new HttpError(400, 'Link your Minecraft account first: in the game, Lux Account module -> "Link website account".');
        }
        const value = JSON.stringify({ type: 'image', hash: cape.image_hash, market: cape.id });
        for (const p of targets) {
            await pool.query('UPDATE lux_players SET cape = ? WHERE uuid = ?', [value, p.uuid]);
        }
        await pool.query('UPDATE lux_capes SET uses = uses + 1 WHERE id = ?', [cape.id]);
        res.json({ ok: true, players: targets.length });
    }));

    router.delete('/capes/:id', writeLimiter, wrap(async (req, res) => {
        const user = webUser(req);
        if (!user) throw new HttpError(401, 'Please sign in first.');
        const [rows] = await pool.query('SELECT * FROM lux_capes WHERE id = ?', [parseInt(req.params.id, 10) || 0]);
        const cape = rows[0];
        if (!cape) throw new HttpError(404, 'Not found.');
        if (cape.user_id !== user.id && user.role !== 'admin') throw new HttpError(403, 'That is not your cape.');
        await pool.query('DELETE FROM lux_capes WHERE id = ?', [cape.id]);
        if (user.role === 'admin' && cape.user_id !== user.id) await audit(user, 'lux_cape.delete', 'lux_cape', cape.id, cape.title);
        res.json({ ok: true });
    }));

    // ------------------------------------------------------------------ admin: moderation

    router.get('/admin/queue', wrap(async (req, res) => {
        requireAdmin(req);
        const [capes] = await pool.query(
            `SELECT c.*, u.username AS author, i.width, i.height FROM lux_capes c
             LEFT JOIN users u ON u.id = c.user_id LEFT JOIN lux_cape_images i ON i.hash = c.image_hash
             WHERE c.status = 'pending' ORDER BY c.id`
        );
        // Pictures from the game that are not part of a pending marketplace upload.
        const [images] = await pool.query(
            `SELECT i.*, p.name AS player, u.username AS account FROM lux_cape_images i
             LEFT JOIN lux_players p ON p.uuid = i.owner_uuid LEFT JOIN users u ON u.id = i.owner_user_id
             WHERE i.status = 'pending' ORDER BY i.created_at`
        );
        const pendingMarketHashes = new Set(capes.map((c) => c.image_hash));
        res.json({
            capes: capes.map((c) => ({ ...listing(c), width: c.width, height: c.height })),
            images: images
                .filter((i) => !pendingMarketHashes.has(i.hash))
                .map((i) => ({
                    hash: i.hash,
                    width: i.width,
                    height: i.height,
                    player: i.player || null,
                    account: i.account || null,
                    created: Number(i.created_at || 0),
                    image: `/api/lux/images/${i.hash}.png`
                }))
        });
    }));

    router.get('/admin/capes', wrap(async (req, res) => {
        requireAdmin(req);
        const [rows] = await pool.query(
            `SELECT c.*, u.username AS author FROM lux_capes c LEFT JOIN users u ON u.id = c.user_id
             WHERE c.status = 'approved' ORDER BY c.id DESC LIMIT 500`
        );
        res.json({ items: rows.map(listing) });
    }));

    async function setImageStatus(hash, status, admin, reason) {
        await pool.query(
            'UPDATE lux_cape_images SET status = ?, reject_reason = ?, reviewed_by = ?, reviewed_at = ? WHERE hash = ?',
            [status, status === 'rejected' ? reason : null, admin.id, now(), hash]
        );
    }

    router.post('/admin/capes/:id/:action', wrap(async (req, res) => {
        const admin = requireAdmin(req);
        const action = req.params.action;
        if (action !== 'approve' && action !== 'reject') throw new HttpError(400, 'Invalid action.');
        const [rows] = await pool.query('SELECT * FROM lux_capes WHERE id = ?', [parseInt(req.params.id, 10) || 0]);
        const cape = rows[0];
        if (!cape) throw new HttpError(404, 'Not found.');
        const reason = String((req.body && req.body.reason) || '').trim().slice(0, 500) || 'Does not follow the cape rules.';
        if (action === 'approve') {
            await pool.query("UPDATE lux_capes SET status = 'approved', reject_reason = NULL, reviewed_at = ? WHERE id = ?", [now(), cape.id]);
            await setImageStatus(cape.image_hash, 'approved', admin, null);
            await notify(cape.user_id, `Your cape "${cape.title}" was approved and is now in the marketplace.`, 'success');
        } else {
            await pool.query("UPDATE lux_capes SET status = 'rejected', reject_reason = ?, reviewed_at = ? WHERE id = ?", [reason, now(), cape.id]);
            // The picture goes too (so nobody keeps wearing it), unless another approved listing uses it.
            const [others] = await pool.query(
                "SELECT id FROM lux_capes WHERE image_hash = ? AND status = 'approved' AND id <> ?",
                [cape.image_hash, cape.id]
            );
            if (others.length === 0) await setImageStatus(cape.image_hash, 'rejected', admin, reason);
            await notify(cape.user_id, `Your cape "${cape.title}" was ${cape.status === 'approved' ? 'removed' : 'rejected'}. Reason: ${reason}`, 'warning');
        }
        await audit(admin, `lux_cape.${action}`, 'lux_cape', cape.id, action === 'reject' ? reason : cape.title);
        res.json({ success: true });
    }));

    router.post('/admin/images/:hash/:action', wrap(async (req, res) => {
        const admin = requireAdmin(req);
        const action = req.params.action;
        if (action !== 'approve' && action !== 'reject') throw new HttpError(400, 'Invalid action.');
        const img = HASH_RE.test(req.params.hash) ? await imageRow(req.params.hash) : null;
        if (!img) throw new HttpError(404, 'Not found.');
        const reason = String((req.body && req.body.reason) || '').trim().slice(0, 500) || 'Does not follow the cape rules.';
        await setImageStatus(img.hash, action === 'approve' ? 'approved' : 'rejected', admin, reason);
        if (action === 'reject') {
            await pool.query("UPDATE lux_capes SET status = 'rejected', reject_reason = ? WHERE image_hash = ?", [reason, img.hash]);
        }
        const [owners] = await pool.query('SELECT user_id FROM lux_players WHERE uuid = ?', [img.owner_uuid || '']);
        const ownerId = img.owner_user_id || (owners[0] && owners[0].user_id);
        await notify(ownerId, action === 'approve'
            ? 'Your in-game cape picture was approved - other Lux players can see it now.'
            : `Your in-game cape picture was rejected. Reason: ${reason}`, action === 'approve' ? 'success' : 'warning');
        await audit(admin, `lux_image.${action}`, 'lux_image', img.hash, action === 'reject' ? reason : null);
        res.json({ success: true });
    }));

    // ------------------------------------------------------------------ admin: Lux players & credits

    async function playerRow(uuid) {
        const [rows] = await pool.query('SELECT * FROM lux_players WHERE uuid = ?', [uuid]);
        return rows[0] || null;
    }

    /** By Minecraft name; unknown names are looked up at Mojang and added (credits for giveaways). */
    async function findPlayer(name) {
        const clean = String(name || '').trim();
        if (!/^[A-Za-z0-9_]{1,16}$/.test(clean)) throw new HttpError(400, 'Invalid Minecraft name.');
        const [rows] = await pool.query(
            'SELECT * FROM lux_players WHERE LOWER(name) = ? ORDER BY last_seen DESC LIMIT 1',
            [clean.toLowerCase()]
        );
        if (rows[0]) return rows[0];
        const profile = await lookupName(clean).catch(() => null);
        if (!profile) throw new HttpError(404, `No Minecraft account called ${clean}.`);
        const existing = await playerRow(profile.uuid);
        if (existing) return existing;
        await pool.query(
            'INSERT INTO lux_players (uuid, name, last_seen, created_at) VALUES (?, ?, ?, ?) RETURNING uuid',
            [profile.uuid, profile.name, 0, now()]
        );
        return playerRow(profile.uuid);
    }

    async function panel(uuid) {
        const p = await playerRow(uuid);
        if (!p) throw new HttpError(404, 'Not found.');
        const [owned] = await pool.query('SELECT item, price, source, acquired_at FROM lux_owned WHERE uuid = ? ORDER BY acquired_at DESC', [uuid]);
        const [log] = await pool.query('SELECT delta, balance, reason, actor, created_at FROM lux_credit_log WHERE uuid = ? ORDER BY id DESC LIMIT 25', [uuid]);
        const [acc] = p.user_id ? await pool.query('SELECT username FROM users WHERE id = ?', [p.user_id]) : [[]];
        return {
            uuid: p.uuid,
            name: p.name,
            credits: Number(p.credits || 0),
            online: Number(p.last_seen || 0) > now() - ONLINE_MS,
            lastSeen: Number(p.last_seen || 0),
            account: acc[0] ? acc[0].username : null,
            cosmetics: parse(p.cosmetics),
            nameStyle: parse(p.name_style),
            cape: parse(p.cape),
            owned: owned.map((o) => ({ item: o.item, price: Number(o.price), source: o.source, at: Number(o.acquired_at) })),
            log: log.map((l) => ({ delta: Number(l.delta), balance: Number(l.balance), reason: l.reason, actor: l.actor, at: Number(l.created_at) }))
        };
    }

    async function addCredits(uuid, delta, reason, admin) {
        const p = await playerRow(uuid);
        if (!p) throw new HttpError(404, 'Not found.');
        const balance = Math.max(0, Number(p.credits || 0) + delta);
        await pool.query('UPDATE lux_players SET credits = ? WHERE uuid = ?', [balance, uuid]);
        await logCredits(uuid, balance - Number(p.credits || 0), balance, reason || (delta > 0 ? 'Giveaway' : 'Removed by an admin'), admin.username);
        await audit(admin, delta >= 0 ? 'lux_credits.add' : 'lux_credits.remove', 'lux_player', p.name, `${delta} (${reason || '-'})`);
        return balance;
    }

    /** After taking something away: remove it from what the player currently wears. */
    async function restrip(uuid) {
        const p = await playerRow(uuid);
        const owned = await ownedSet(uuid);
        const cos = p.cosmetics ? cleanCosmetics(parse(p.cosmetics), owned) : null;
        const ns = p.name_style ? cleanNameStyle(parse(p.name_style), owned) : null;
        const rev = Math.max(now(), Number(p.rev || 0) + 1);
        await pool.query('UPDATE lux_players SET cosmetics = ?, name_style = ?, rev = ? WHERE uuid = ?',
            [cos ? JSON.stringify(cos) : null, ns ? JSON.stringify(ns) : null, rev, uuid]);
        if (live.has(uuid)) live.get(uuid).rev = rev;
    }

    router.get('/admin/players', wrap(async (req, res) => {
        requireAdmin(req);
        const p = await findPlayer(req.query.name);
        res.json(await panel(p.uuid));
    }));

    router.get('/admin/players/:uuid', wrap(async (req, res) => {
        requireAdmin(req);
        res.json(await panel(cleanUuid(req.params.uuid)));
    }));

    router.get('/admin/shop', wrap(async (req, res) => {
        requireAdmin(req);
        res.json({ prices: shop.PRICES });
    }));

    router.post('/admin/players/:uuid/credits', wrap(async (req, res) => {
        const admin = requireAdmin(req);
        const delta = Number(req.body && req.body.delta);
        if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 10000000) throw new HttpError(400, 'Invalid amount.');
        const credits = await addCredits(cleanUuid(req.params.uuid), delta, req.body.reason, admin);
        res.json({ success: true, credits });
    }));

    router.post('/admin/players/:uuid/grant', wrap(async (req, res) => {
        const admin = requireAdmin(req);
        const uuid = cleanUuid(req.params.uuid);
        const item = String((req.body && req.body.item) || '');
        if (!shop.ITEM_RE.test(item) || shop.price(item) === null) throw new HttpError(400, 'Unknown item.');
        if (!(await playerRow(uuid))) throw new HttpError(404, 'Not found.');
        await pool.query(
            'INSERT INTO lux_owned (uuid, item, price, source, acquired_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (uuid, item) DO NOTHING RETURNING uuid',
            [uuid, item, 0, 'admin', now()]
        );
        await audit(admin, 'lux_item.grant', 'lux_player', uuid, item);
        res.json({ success: true });
    }));

    router.post('/admin/players/:uuid/revoke', wrap(async (req, res) => {
        const admin = requireAdmin(req);
        const uuid = cleanUuid(req.params.uuid);
        const item = String((req.body && req.body.item) || '');
        await pool.query('DELETE FROM lux_owned WHERE uuid = ? AND item = ?', [uuid, item]);
        await restrip(uuid);
        await audit(admin, 'lux_item.revoke', 'lux_player', uuid, item);
        res.json({ success: true });
    }));

    router.post('/admin/players/:uuid/reset-line', wrap(async (req, res) => {
        const admin = requireAdmin(req);
        const uuid = cleanUuid(req.params.uuid);
        const p = await playerRow(uuid);
        if (!p) throw new HttpError(404, 'Not found.');
        const ns = parse(p.name_style);
        if (ns) delete ns.line;
        const rev = Math.max(now(), Number(p.rev || 0) + 1);
        await pool.query('UPDATE lux_players SET name_style = ?, rev = ? WHERE uuid = ?', [ns ? JSON.stringify(ns) : null, rev, uuid]);
        if (live.has(uuid)) live.get(uuid).rev = rev;
        await audit(admin, 'lux_name.reset_line', 'lux_player', p.name, ns ? null : 'no style');
        res.json({ success: true });
    }));

    router.post('/admin/players/:uuid/reset-cosmetics', wrap(async (req, res) => {
        const admin = requireAdmin(req);
        const uuid = cleanUuid(req.params.uuid);
        const p = await playerRow(uuid);
        if (!p) throw new HttpError(404, 'Not found.');
        const rev = Math.max(now(), Number(p.rev || 0) + 1);
        await pool.query('UPDATE lux_players SET cosmetics = NULL, rev = ? WHERE uuid = ?', [rev, uuid]);
        if (live.has(uuid)) live.get(uuid).rev = rev;
        await audit(admin, 'lux_cosmetics.reset', 'lux_player', p.name, null);
        res.json({ success: true });
    }));

    // Quick giveaway: Minecraft name + amount.
    router.post('/admin/credits/give', wrap(async (req, res) => {
        const admin = requireAdmin(req);
        const amount = Number(req.body && req.body.amount);
        if (!Number.isInteger(amount) || amount <= 0 || amount > 10000000) throw new HttpError(400, 'Invalid amount.');
        const p = await findPlayer(req.body.name);
        const credits = await addCredits(p.uuid, amount, req.body.reason || 'Giveaway', admin);
        res.json({ success: true, name: p.name, uuid: p.uuid, credits });
    }));

    // ------------------------------------------------------------------ errors

    router.use((req, res) => res.status(404).json({ error: 'Unknown address.' }));

    // eslint-disable-next-line no-unused-vars
    router.use((err, req, res, next) => {
        if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
        if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'The picture may be at most 1 MB.' });
        console.error('[LuxCosmetics]', err);
        res.status(500).json({ error: 'Server error.' });
    });

    const cleanup = setInterval(async () => {
        const t = now();
        for (const [k, v] of challenges) if (v.expires < t) challenges.delete(k);
        for (const [k, v] of linkCodes) if (v.expires < t) linkCodes.delete(k);
        for (const [k, v] of emotes) if (t - v.started > EMOTE_MS) emotes.delete(k);
        for (const [k, v] of live) if (t - v.seen > ONLINE_MS) live.delete(k);
        for (const [k, v] of missing) if (v < t) missing.delete(k);
        try {
            await pool.query('DELETE FROM lux_tokens WHERE expires < ?', [t]);
        } catch {
            // next round
        }
    }, 10 * 60 * 1000);
    cleanup.unref();

    return router;
}

module.exports = createLuxRouter;
module.exports.HttpError = HttpError;
