const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const BASE_DATA_DIR = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : __dirname;
const CODES_DIR = path.join(BASE_DATA_DIR, 'codes');
if (!fs.existsSync(CODES_DIR)) {
    console.log(`[CodesSystem] Creating codes directory: ${CODES_DIR}`);
    fs.mkdirSync(CODES_DIR, { recursive: true });
}
function cleanupOldCodes(pool) {
    console.log('[CodesSystem] Running cleanup for old codes...');
    const now = Date.now();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

    fs.readdir(CODES_DIR, async (err, files) => {
        if (err) {
            console.error('[CodesSystem] Failed to read codes directory for cleanup:', err);
            return;
        }

        for (const file of files) {
            if (!file.endsWith('.json')) continue;

            const filePath = path.join(CODES_DIR, file);
            try {
                const stats = fs.statSync(filePath);
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

                // Guests (Website) = 5 days, Accounts (Launcher) = 7 days.
                // Admins can override that per code (fixed date or never, see parseExpiry).
                const expiry = data.owner_uuid ? SEVEN_DAYS_MS : FIVE_DAYS_MS;
                const expired = data.expiryMode === 'never'
                    ? false
                    : data.expiryMode === 'custom'
                        ? Number(data.expires) > 0 && now > Number(data.expires)
                        : now - stats.mtimeMs > expiry;

                if (expired) {
                    fs.unlinkSync(filePath);
                    if (pool) {
                        try {
                            await pool.query('DELETE FROM modpack_codes WHERE code = ?', [file.replace('.json', '')]);
                        } catch (dbErr) {
                            console.error(`[CodesSystem] DB cleanup error for ${file}:`, dbErr);
                        }
                    }
                    console.log(`[CodesSystem] Deleted expired code: ${file}`);
                }
            } catch (e) {
                console.error(`[CodesSystem] Cleanup error for ${file}:`, e);
            }
        }
    });
}

function generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let code;
    do {
        code = '';
        for (let i = 0; i < 8; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
    } while (fs.existsSync(path.join(CODES_DIR, `${code}.json`)));
    return code;
}

// Modpack icons arrive as arbitrary user-submitted bytes (base64 data URIs) and get
// redistributed to whoever imports the code, so they can't be trusted as-is — a
// crafted "image" could smuggle a polyglot payload. Decoding and re-encoding through
// sharp/libvips only ever serializes genuine pixel data it understood, which drops any
// non-image bytes appended or hidden in the original file, and rejects anything that
// isn't a real image outright. Any failure here just means "no icon", not a failed export.
const ICON_MAX_INPUT_BYTES = 6 * 1024 * 1024;
const ICON_MAX_OUTPUT_BYTES = 1 * 1024 * 1024;
const ICON_MAX_DIMENSION = 256;

async function sanitizeIcon(iconValue) {
    if (!iconValue || typeof iconValue !== 'string') return null;
    const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/.exec(iconValue.trim());
    if (!match) return null;

    const base64Payload = match[1];
    // Rough pre-check on the encoded string length before paying for a full decode.
    if (base64Payload.length > ICON_MAX_INPUT_BYTES * 1.4) return null;

    try {
        const inputBuffer = Buffer.from(base64Payload, 'base64');
        if (inputBuffer.length === 0 || inputBuffer.length > ICON_MAX_INPUT_BYTES) return null;

        const outputBuffer = await sharp(inputBuffer, { limitInputPixels: 50_000_000, failOn: 'error' })
            .rotate()
            .resize(ICON_MAX_DIMENSION, ICON_MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
            .png({ compressionLevel: 8 })
            .toBuffer();

        if (outputBuffer.length === 0 || outputBuffer.length > ICON_MAX_OUTPUT_BYTES) return null;

        return `data:image/png;base64,${outputBuffer.toString('base64')}`;
    } catch (e) {
        console.warn('[CodesSystem] Rejected modpack icon (not a valid image):', e.message);
        return null;
    }
}

// Codes are generated from [A-Za-z0-9]{8}. Anything else never names a real code and
// must not reach path.join (a decoded "../" in the URL would otherwise leave CODES_DIR).
const CODE_PATTERN = /^[A-Za-z0-9]{8}$/;

function isValidCode(code) {
    return typeof code === 'string' && CODE_PATTERN.test(code);
}

function codeFilePath(code) {
    return path.join(CODES_DIR, `${code}.json`);
}

// A code with an admin-set expiry date is gone the moment that date passes, not only
// once the hourly cleanup has run.
function isExpired(data) {
    return Boolean(data && data.expiryMode === 'custom' && Number(data.expires) > 0 && Date.now() > Number(data.expires));
}

function readCodeFile(code) {
    if (!isValidCode(code)) return null;
    const filePath = codeFilePath(code);
    if (!fs.existsSync(filePath)) return null;
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return isExpired(data) ? null : data;
}

function writeCodeFile(code, data) {
    const filePath = codeFilePath(code);
    const temp = `${filePath}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(data, null, 2));
    fs.renameSync(temp, filePath);
}

const MAX_EXPIRY_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

// Only admins may pick how long a code lives: a number of days (1-365) or 'never'.
// Returns null for "not given", { error } for an invalid value.
function parseExpiry(value) {
    if (value === undefined || value === null || value === '') return null;
    if (value === 'never') return { expiryMode: 'never', expires: null };
    const days = Number(value);
    if (!Number.isInteger(days) || days < 1 || days > MAX_EXPIRY_DAYS) {
        return { error: `Expiry must be 'never' or a whole number of days between 1 and ${MAX_EXPIRY_DAYS}.` };
    }
    return { expiryMode: 'custom', expires: Date.now() + days * DAY_MS };
}

function contentFromBody(body) {
    const list = (value) => (Array.isArray(value) ? value : []);
    return {
        mods: list(body.mods),
        resourcePacks: list(body.resourcePacks),
        shaders: list(body.shaders)
    };
}

function liveInfo(data) {
    return {
        live: Boolean(data.live),
        revision: Number(data.revision) || 1,
        updated: data.updated || data.created || null,
        expiryMode: data.expiryMode || 'default'
    };
}

// What a launcher that installed a live code needs to bring itself up to date.
// No owner data, no options.txt (players keep their own settings after the first import).
function buildLivePayload(data) {
    return {
        code: data.code,
        name: data.name || 'Exported Modpack',
        version: data.version || null,
        loader: data.loader || null,
        mods: Array.isArray(data.mods) ? data.mods : [],
        resourcePacks: Array.isArray(data.resourcePacks) ? data.resourcePacks : [],
        shaders: Array.isArray(data.shaders) ? data.shaders : [],
        ...liveInfo(data)
    };
}

function previewContentItem(item) {
    if (typeof item === 'string') {
        return { projectId: item, versionId: null, title: item, icon: null, fileName: item };
    }
    const source = item || {};
    return {
        projectId: typeof source.projectId === 'string' ? source.projectId : null,
        versionId: typeof source.versionId === 'string' ? source.versionId : null,
        title: String(source.title || source.fileName || source.projectId || 'Unknown'),
        icon: typeof source.icon === 'string' && /^https:\/\//.test(source.icon) ? source.icon : null,
        fileName: typeof source.fileName === 'string' ? source.fileName : null
    };
}

// Public, read-only view of a code for the website preview page (/code/:code).
// Leaves out who created it and the raw options.txt -- only whether settings are included.
function buildCodePreview(data) {
    return {
        code: data.code,
        name: data.name || 'Exported Modpack',
        version: data.version || null,
        loader: data.loader || null,
        icon: data.icon || null,
        created: data.created || null,
        expires: data.expires || null,
        uses: data.uses || 0,
        live: Boolean(data.live),
        revision: Number(data.revision) || 1,
        updated: data.updated || data.created || null,
        hasSettings: Boolean(data.keybinds),
        mods: (Array.isArray(data.mods) ? data.mods : []).map(previewContentItem),
        resourcePacks: (Array.isArray(data.resourcePacks) ? data.resourcePacks : []).map(previewContentItem),
        shaders: (Array.isArray(data.shaders) ? data.shaders : []).map(previewContentItem)
    };
}

function readCodePreview(code) {
    try {
        const data = readCodeFile(code);
        return data ? buildCodePreview(data) : null;
    } catch (e) {
        return null;
    }
}

const createAdminAuth = require('./middleware/adminAuth');
const { ensureDeviceAuth } = require('./middleware/deviceAuth');

// Who is calling: the launcher sends its Lux account token (Bearer), the website has its
// session. Both are optional -- without them a code is created exactly as before.
function optionalCodeUser(req, res, next) {
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) {
        return ensureDeviceAuth(req, res, next);
    }
    if (typeof req.isAuthenticated === 'function' && req.isAuthenticated() && req.user && !req.user.banned) {
        req.cloudUser = req.user;
        req.cloudUserId = req.user.id;
    }
    return next();
}

function isCodeAdmin(req) {
    return Boolean(req.cloudUser && req.cloudUser.role === 'admin');
}

function requireCodeAdmin(req, res, next) {
    if (!req.cloudUser) {
        return res.status(401).json({ success: false, error: 'Sign in with your Lux account first.' });
    }
    if (!isCodeAdmin(req)) {
        return res.status(403).json({ success: false, error: 'Only admins can manage live codes.' });
    }
    return next();
}

module.exports = function (app, ADMIN_PASSWORD, pool) {
    // Same rules as the rest of the admin surface: never from the query string,
    // constant-time compare, and a rate limit on the guessable path.
    const adminAuth = createAdminAuth(ADMIN_PASSWORD);

    console.log('[CodesSystem] Initializing routes...');

    setInterval(() => cleanupOldCodes(pool), 60 * 60 * 1000);
    cleanupOldCodes(pool);

    async function handleSave(req, res) {
        try {
            const { name, mods, resourcePacks, shaders, instanceVersion, instanceLoader, keybinds, ownerUuid, icon } = req.body;
            const wantsLive = req.body.live === true;
            const expiry = parseExpiry(req.body.expiry);
            if ((wantsLive || expiry) && !isCodeAdmin(req)) {
                return res.status(403).json({ success: false, error: 'Only admins can create live codes or change how long a code lasts.' });
            }
            if (expiry && expiry.error) {
                return res.status(400).json({ success: false, error: expiry.error });
            }
            let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            if (ip) {
                // x-forwarded-for can contain multiple comma-separated IPs. We only want the first one (the original client).
                ip = ip.split(',')[0].trim();
            }

            // Check Rate Limiting
            if (pool) {
                if (ownerUuid) {
                    // Launcher: Max 10
                    const [rows] = await pool.query('SELECT COUNT(*) as count FROM modpack_codes WHERE owner_uuid = ?', [ownerUuid]);
                    if (rows[0].count >= 10) {
                        return res.status(429).json({ success: false, error: 'Maximum limit reached (10 codes per account). Delete old codes to create new ones.' });
                    }
                } else {
                    // Website Guest: Max 5
                    const [rows] = await pool.query('SELECT COUNT(*) as count FROM modpack_codes WHERE owner_ip = ?', [ip]);
                    if (rows[0].count >= 5) {
                        return res.status(429).json({ success: false, error: 'Maximum limit reached (5 codes per IP). Codes expire after 5 days.' });
                    }
                }
            }

            const code = generateCode();
            const expiryDays = ownerUuid ? 7 : 5;
            const safeIcon = await sanitizeIcon(icon);

            const now = Date.now();
            const data = {
                code,
                name: name || 'Exported Modpack',
                version: instanceVersion,
                loader: instanceLoader,
                mods: mods || [],
                resourcePacks: resourcePacks || [],
                shaders: shaders || [],
                keybinds: keybinds || null,
                icon: safeIcon,
                created: now,
                updated: now,
                expires: expiry ? expiry.expires : now + (expiryDays * DAY_MS),
                expiryMode: expiry ? expiry.expiryMode : 'default',
                live: wantsLive,
                revision: 1,
                uses: 0,
                owner_uuid: ownerUuid || null,
                owner_user_id: req.cloudUser ? req.cloudUser.id : null,
                owner_ip: ip
            };

            writeCodeFile(code, data);

            if (pool) {
                await pool.query('INSERT INTO modpack_codes (code, owner_uuid, owner_ip) VALUES (?, ?, ?)', [code, ownerUuid || null, ip]);
            }

            console.log(`[CodesSystem] Saved modpack ${code} (${name}) for ${ownerUuid || ip}${wantsLive ? ' [live]' : ''}`);
            res.json({ success: true, code, ...liveInfo(data), expires: data.expires });
        } catch (error) {
            console.error('[CodesSystem] Save error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    app.post('/api/codes/save', optionalCodeUser, handleSave);
    app.post('/api/modpack/save', optionalCodeUser, handleSave);

    // Lets the launcher decide whether to show the admin options at all.
    app.get('/api/modpack/admin/status', optionalCodeUser, (req, res) => {
        res.json({ success: true, isAdmin: isCodeAdmin(req) });
    });

    // Replaces what a live code installs. The code itself stays the same, launchers that
    // installed it pick the new revision up on their next start.
    app.put('/api/modpack/:code/content', optionalCodeUser, requireCodeAdmin, async (req, res) => {
        try {
            const { code } = req.params;
            const data = readCodeFile(code);
            if (!data) {
                return res.status(404).json({ success: false, error: 'Code not found' });
            }
            if (!data.live) {
                return res.status(409).json({ success: false, error: 'This code is not a live code.' });
            }

            const body = req.body || {};
            Object.assign(data, contentFromBody(body));
            if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim().slice(0, 100);
            if (body.instanceVersion) data.version = body.instanceVersion;
            if (body.instanceLoader) data.loader = body.instanceLoader;
            if (Object.prototype.hasOwnProperty.call(body, 'keybinds')) data.keybinds = body.keybinds || null;
            if (body.icon) {
                const safeIcon = await sanitizeIcon(body.icon);
                if (safeIcon) data.icon = safeIcon;
            }
            data.revision = (Number(data.revision) || 1) + 1;
            data.updated = Date.now();

            writeCodeFile(code, data);
            console.log(`[CodesSystem] Live code ${code} updated to revision ${data.revision} by ${req.cloudUser.username || req.cloudUser.id}`);
            res.json({ success: true, code, ...liveInfo(data), expires: data.expires });
        } catch (error) {
            console.error('[CodesSystem] Live update error:', error);
            res.status(500).json({ success: false, error: 'Failed to update code' });
        }
    });

    // Turn live mode on/off and set how long the code lasts ('never' or 1-365 days).
    app.patch('/api/modpack/:code/settings', optionalCodeUser, requireCodeAdmin, (req, res) => {
        try {
            const { code } = req.params;
            const data = readCodeFile(code);
            if (!data) {
                return res.status(404).json({ success: false, error: 'Code not found' });
            }

            const body = req.body || {};
            const expiry = parseExpiry(body.expiry);
            if (expiry && expiry.error) {
                return res.status(400).json({ success: false, error: expiry.error });
            }
            if (expiry) {
                data.expiryMode = expiry.expiryMode;
                data.expires = expiry.expires;
            }
            if (typeof body.live === 'boolean') {
                data.live = body.live;
                data.revision = Number(data.revision) || 1;
            }

            writeCodeFile(code, data);
            res.json({ success: true, code, ...liveInfo(data), expires: data.expires });
        } catch (error) {
            console.error('[CodesSystem] Settings error:', error);
            res.status(500).json({ success: false, error: 'Failed to update code' });
        }
    });

    // Polled by launchers before starting an instance installed from a live code.
    // Does not count as a use.
    app.get('/api/modpack/:code/live', (req, res) => {
        try {
            const { code } = req.params;
            if (!isValidCode(code)) {
                return res.status(400).json({ success: false, error: 'Invalid code format' });
            }
            const data = readCodeFile(code);
            if (!data) {
                return res.status(404).json({ success: false, error: 'Code not found' });
            }
            res.setHeader('Cache-Control', 'no-store');
            res.json({ success: true, data: buildLivePayload(data) });
        } catch (error) {
            console.error('[CodesSystem] Live check error:', error);
            res.status(500).json({ success: false, error: 'Failed to load code' });
        }
    });

    app.get('/api/modpack/my-codes', async (req, res) => {
        try {
            const { uuid } = req.query;
            let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            if (ip) {
                ip = ip.split(',')[0].trim();
            }

            console.log(`[CodesSystem-Debug] ðŸ” my-codes called. Query UUID: '${uuid}', Extracted IP: '${ip}'`);

            let rows = [];
            if (uuid && uuid !== 'undefined' && uuid !== 'null') {
                console.log(`[CodesSystem-Debug] ðŸ” Searching database via UUID: ${uuid}`);
                [rows] = await pool.query('SELECT code FROM modpack_codes WHERE owner_uuid = ?', [uuid]);
            } else {
                console.log(`[CodesSystem-Debug] ðŸ” Searching database via IP: ${ip}`);
                [rows] = await pool.query('SELECT code FROM modpack_codes WHERE owner_ip = ?', [ip]);
            }

            console.log(`[CodesSystem-Debug] ðŸ” Database returned ${rows.length} rows:`, rows);

            const codes = [];

            for (const row of rows) {
                const filePath = path.join(CODES_DIR, `${row.code}.json`);
                const exists = fs.existsSync(filePath);
                console.log(`[CodesSystem-Debug] ðŸ” Checking file for code ${row.code} at ${filePath}. Exists on disk? ${exists}`);

                if (exists) {
                    try {
                        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                        codes.push({
                            code: content.code,
                            name: content.name,
                            created: content.created,
                            expires: content.expires,
                            uses: content.uses || 0,
                            hasIcon: !!content.icon,
                            ...liveInfo(content)
                        });
                    } catch (e) {
                        console.error(`[CodesSystem-Debug] âŒ JSON Parse Error for code ${row.code}:`, e.message);
                    }
                }
            }

            console.log(`[CodesSystem-Debug] âœ… Returning ${codes.length} valid codes to frontend.`);
            res.json({ success: true, codes });
        } catch (error) {
            console.error('[CodesSystem] List user codes error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.delete('/api/modpack/delete/:code', async (req, res) => {
        try {
            const { code } = req.params;
            const { uuid } = req.query;

            const filePath = path.join(CODES_DIR, `${code}.json`);
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ success: false, error: 'Code not found' });
            }

            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            if (ip) {
                ip = ip.split(',')[0].trim();
            }

            // Deletion for account owners OR IP owners (website)
            const isOwner = (data.owner_uuid && data.owner_uuid === uuid) || (data.owner_ip && data.owner_ip === ip);
            const isAdmin = req.isAuthenticated() && req.user.role === 'admin';

            if (isOwner || isAdmin) {
                fs.unlinkSync(filePath);
                if (pool) {
                    await pool.query('DELETE FROM modpack_codes WHERE code = ?', [code]);
                }
                console.log(`[CodesSystem] Deleted code ${code} by ${isOwner ? 'owner' : 'admin'}`);
                return res.json({ success: true });
            }

            res.status(403).json({ success: false, error: 'Forbidden: You do not own this code' });
        } catch (error) {
            console.error('[CodesSystem] Delete error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.get('/api/codes/list', adminAuth.adminAuthLimiter, adminAuth.adminOrPassword, (req, res) => {
        try {
            if (!fs.existsSync(CODES_DIR)) {
                return res.json({ success: true, codes: [] });
            }
            const files = fs.readdirSync(CODES_DIR).filter(f => f.endsWith('.json'));
            const codes = files.map(file => {
                try {
                    const content = JSON.parse(fs.readFileSync(path.join(CODES_DIR, file), 'utf8'));
                    return {
                        code: content.code || file.replace('.json', ''),
                        name: content.name,
                        version: content.version,
                        loader: content.loader,
                        uses: content.uses || 0,
                        created: content.created,
                        expires: content.expires,
                        owner_uuid: content.owner_uuid,
                        owner_ip: content.owner_ip,
                        hasIcon: !!content.icon,
                        ...liveInfo(content)
                    };
                } catch (e) {
                    return null;
                }
            }).filter(Boolean);

            res.json({ success: true, codes });
        } catch (error) {
            console.error('[CodesSystem] List error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Read-only preview for the website: does not count as a use.
    app.get('/api/modpack/:code/preview', (req, res) => {
        try {
            const { code } = req.params;
            if (!isValidCode(code)) {
                return res.status(400).json({ success: false, error: 'Invalid code format' });
            }
            const preview = readCodePreview(code);
            if (!preview) {
                return res.status(404).json({ success: false, error: 'Code not found' });
            }
            res.setHeader('Cache-Control', 'no-store');
            res.json({ success: true, data: preview });
        } catch (error) {
            console.error('[CodesSystem] Preview error:', error);
            res.status(500).json({ success: false, error: 'Failed to load code' });
        }
    });

    function handleGetCode(req, res) {
        try {
            const { code } = req.params;
            if (!isValidCode(code)) {
                return res.status(404).json({ success: false, error: 'Code not found' });
            }
            const data = readCodeFile(code);

            if (data) {
                data.uses = (data.uses || 0) + 1;
                writeCodeFile(code, data);

                res.json({ success: true, data: { ...data, ...liveInfo(data) } });
            } else {
                res.status(404).json({ success: false, error: 'Code not found' });
            }
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
    app.get('/api/codes/:code', handleGetCode);
    app.get('/api/modpack/:code', handleGetCode);

    app.delete('/api/codes/:code', adminAuth.adminAuthLimiter, adminAuth.adminOrPassword, (req, res) => {
        try {
            const { code } = req.params;
            const filePath = path.join(CODES_DIR, `${code}.json`);

            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                if (pool) {
                    pool.query('DELETE FROM modpack_codes WHERE code = ?', [code]).catch(e => console.error(e));
                }
                res.json({ success: true });
            } else {
                res.status(404).json({ success: false, error: 'Code not found' });
            }
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });
};

module.exports.readCodePreview = readCodePreview;
module.exports.isValidCode = isValidCode;
