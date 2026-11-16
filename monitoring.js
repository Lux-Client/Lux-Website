// Error rate and failures for the admin panel ("Health").
//
// Every API request is counted per area (login, password reset, account deletion, ...) as
// ok or failed. "Failed" means the server could not do its job (status 500 and up): a wrong
// password or a taken username is a normal answer, not an outage. Counts are kept in memory
// and written once a minute in hourly buckets; failures are also stored one by one with the
// error message, so they can be looked at and fixed. Data older than 30 days is dropped.

const pool = require('./database');

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const FLUSH_MS = 60 * 1000;
const MAX_ERRORS_PER_MINUTE = 60;
// The same failure (area + status + message) is stored at most once per 10 minutes; it is still counted.
const DEDUPE_MS = 10 * 60 * 1000;

// Area of a request, matched in order. Labels are shown in the admin panel.
const AREAS = [
    ['login', 'Sign-in (email)', (m, p) => p === '/api/auth/login'],
    ['login_2fa', 'Sign-in: 2FA code', (m, p) => p === '/api/auth/login/2fa'],
    ['passkey_login', 'Sign-in: passkey', (m, p) => p.startsWith('/api/auth/passkey/')],
    ['google_login', 'Sign-in (Google)', (m, p) => p.startsWith('/auth/google')],
    ['register', 'Registration', (m, p) => p === '/api/auth/register'],
    ['verify_email', 'Email confirmation', (m, p) => p === '/api/auth/verify-email' || p === '/api/auth/resend-verification'],
    ['password_reset', 'Password reset', (m, p) => p.startsWith('/api/auth/forgot-password') || p.startsWith('/api/auth/reset-password')],
    ['account_security', 'Security settings', (m, p) => p.startsWith('/api/account/')],
    ['account_delete', 'Account deletion', (m, p) => p === '/api/user/delete'],
    ['profile', 'Profile', (m, p) => p.startsWith('/api/user')],
    ['device_auth', 'Launcher sign-in', (m, p) => p.startsWith('/auth/device') || p.startsWith('/api/auth/device') || p === '/authorize-device'],
    ['cloud', 'Lux Cloud', (m, p) => p.startsWith('/api/cloud')],
    ['modpack_codes', 'Modpack codes', (m, p) => p.startsWith('/api/modpack')],
    ['lux_mod', 'Lux Client mod', (m, p) => p.startsWith('/api/lux')],
    ['extensions', 'Extensions', (m, p) => p.startsWith('/api/extensions') || p.startsWith('/api/upload')],
    ['admin', 'Admin panel', (m, p) => p.startsWith('/api/admin')],
    ['other_api', 'Other API', (m, p) => p.startsWith('/api/')],
];
const AREA_LABELS = Object.fromEntries(AREAS.map(([id, label]) => [id, label]).concat([['email', 'Email sending'], ['server', 'Server']]));

function areaFor(method, path) {
    for (const [id, , match] of AREAS) if (match(method, path)) return id;
    return null;
}

let pending = new Map(); // `${bucket}|${area}` -> { ok, fail }
let errorsThisMinute = 0;
let minuteStarted = Date.now();
let lastCleanup = 0;
let timer = null;
const recentMessages = new Map(); // `${area}|${message}` -> time, to avoid storing the same failure 1000 times
let now = () => Date.now();

function count(area, ok) {
    if (!area) return;
    const bucket = Math.floor(now() / HOUR_MS) * HOUR_MS;
    const key = `${bucket}|${area}`;
    const entry = pending.get(key) || { ok: 0, fail: 0 };
    if (ok) entry.ok++; else entry.fail++;
    pending.set(key, entry);
}

function clip(value, max) {
    const text = String(value ?? '');
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// Stores one failure. Never throws.
async function recordError({ area = 'server', method = null, path = null, status = null, message, detail = null, userId = null }) {
    try {
        if (now() - minuteStarted > 60000) { minuteStarted = now(); errorsThisMinute = 0; }
        if (++errorsThisMinute > MAX_ERRORS_PER_MINUTE) return;
        const key = `${area}|${status}|${message}`;
        const last = recentMessages.get(key);
        if (last && now() - last < DEDUPE_MS) return;
        recentMessages.set(key, now());
        if (recentMessages.size > 2000) {
            for (const [k, t] of recentMessages) if (now() - t > DEDUPE_MS) recentMessages.delete(k);
        }
        await pool.query(
            'INSERT INTO app_errors (area, method, path, status, message, detail, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [area, method, path ? clip(path.split('?')[0], 200) : null, status, clip(message || 'Unknown error', 500), detail ? clip(detail, 2000) : null, userId]
        );
    } catch (err) {
        console.error('[Monitoring] Could not store an error:', err.message);
    }
}

// The message of a thrown error, kept for the failure entry of this response.
function noteError(res, err) {
    if (!res || !res.locals) return;
    res.locals.monitorError = err;
}

function errorDetail(err) {
    if (!err) return null;
    const stack = String(err.stack || '').split('\n').slice(0, 4).join('\n');
    return stack || String(err.message || err);
}

// Express middleware: counts every API response and records failures.
function middleware() {
    return (req, res, next) => {
        const path = req.path || '';
        const area = areaFor(req.method, path);
        if (!area) return next();
        const originalJson = res.json.bind(res);
        res.json = (body) => {
            if (res.statusCode >= 500 && body && typeof body === 'object') res.locals.monitorBody = body;
            return originalJson(body);
        };
        res.on('finish', () => {
            const failed = res.statusCode >= 500;
            count(area, !failed);
            if (!failed) return;
            const err = res.locals.monitorError;
            const body = res.locals.monitorBody;
            const bodyText = body && (body.code ? `${body.code}: ${body.error || ''}` : (body.error || body.message));
            recordError({
                area,
                method: req.method,
                path,
                status: res.statusCode,
                message: (err && err.message) || bodyText || `HTTP ${res.statusCode}`,
                detail: errorDetail(err),
                userId: req.user && req.user.id ? req.user.id : null,
            });
        });
        next();
    };
}

async function flush() {
    const batch = pending;
    pending = new Map();
    for (const [key, { ok, fail }] of batch) {
        const [bucket, area] = key.split('|');
        try {
            await pool.query(
                `INSERT INTO app_event_counts (bucket, area, ok_count, fail_count) VALUES (?, ?, ?, ?)
                 ON CONFLICT (bucket, area) DO UPDATE SET ok_count = app_event_counts.ok_count + EXCLUDED.ok_count,
                     fail_count = app_event_counts.fail_count + EXCLUDED.fail_count
                 RETURNING area`,
                [Number(bucket), area, ok, fail]
            );
        } catch (err) {
            console.error('[Monitoring] Could not write counts:', err.message);
        }
    }
    if (now() - lastCleanup > HOUR_MS) {
        lastCleanup = now();
        const cutoff = now() - RETENTION_MS;
        await pool.query('DELETE FROM app_event_counts WHERE bucket < ?', [cutoff]).catch(() => {});
        await pool.query('DELETE FROM app_errors WHERE created_at < ?', [new Date(cutoff)]).catch(() => {});
        await pool.query('DELETE FROM email_log WHERE created_at < ?', [new Date(cutoff)]).catch(() => {});
    }
}

function start() {
    if (timer) return;
    timer = setInterval(() => { flush().catch(() => {}); }, FLUSH_MS);
    if (timer.unref) timer.unref();
}

// ── admin report ────────────────────────────────────────────────────────────

async function report() {
    await flush();
    const t = now();
    const dayAgo = t - 24 * HOUR_MS;
    const weekAgo = t - 7 * 24 * HOUR_MS;

    const [rows] = await pool.query('SELECT bucket, area, ok_count, fail_count FROM app_event_counts WHERE bucket >= ?', [weekAgo - HOUR_MS]);
    const [lastErrors] = await pool.query(
        'SELECT DISTINCT ON (area) area, message, created_at FROM app_errors ORDER BY area, created_at DESC'
    ).catch(() => [[]]);
    const lastByArea = Object.fromEntries((lastErrors || []).map((e) => [e.area, e]));

    const areas = {};
    const hourly = [];
    for (let i = 23; i >= 0; i--) {
        const bucket = Math.floor((t - i * HOUR_MS) / HOUR_MS) * HOUR_MS;
        hourly.push({ bucket: new Date(bucket).toISOString(), ok: 0, fail: 0 });
    }
    const firstHour = Date.parse(hourly[0].bucket);
    for (const r of rows) {
        const bucket = Number(r.bucket);
        const a = areas[r.area] || (areas[r.area] = { area: r.area, label: AREA_LABELS[r.area] || r.area, ok24: 0, fail24: 0, ok7d: 0, fail7d: 0 });
        a.ok7d += Number(r.ok_count); a.fail7d += Number(r.fail_count);
        if (bucket >= dayAgo - HOUR_MS) { a.ok24 += Number(r.ok_count); a.fail24 += Number(r.fail_count); }
        if (bucket >= firstHour) {
            const slot = hourly[Math.floor((bucket - firstHour) / HOUR_MS)];
            if (slot) { slot.ok += Number(r.ok_count); slot.fail += Number(r.fail_count); }
        }
    }
    const rate = (fail, ok) => (fail + ok ? fail / (fail + ok) : 0);
    const list = Object.values(areas).map((a) => ({
        ...a,
        rate24: rate(a.fail24, a.ok24),
        rate7d: rate(a.fail7d, a.ok7d),
        lastError: lastByArea[a.area] || null,
    })).sort((x, y) => y.fail24 - x.fail24 || y.fail7d - x.fail7d || (y.ok24 + y.fail24) - (x.ok24 + x.fail24));

    const [errors] = await pool.query(
        'SELECT id, area, method, path, status, message, detail, user_id, created_at, seen_at FROM app_errors ORDER BY created_at DESC LIMIT 200'
    );
    const [unseen] = await pool.query('SELECT COUNT(*) AS n FROM app_errors WHERE seen_at IS NULL');

    const totals = list.reduce((acc, a) => ({ ok24: acc.ok24 + a.ok24, fail24: acc.fail24 + a.fail24 }), { ok24: 0, fail24: 0 });
    return {
        generatedAt: new Date(t).toISOString(),
        totals: { ...totals, rate24: rate(totals.fail24, totals.ok24) },
        unseenErrors: Number(unseen[0]?.n || 0),
        areas: list,
        hourly,
        errors: errors.map((e) => ({ ...e, areaLabel: AREA_LABELS[e.area] || e.area })),
    };
}

async function unseenCount() {
    const [rows] = await pool.query('SELECT COUNT(*) AS n FROM app_errors WHERE seen_at IS NULL');
    return Number(rows[0]?.n || 0);
}

async function markSeen() {
    await pool.query('UPDATE app_errors SET seen_at = NOW() WHERE seen_at IS NULL');
}

module.exports = {
    AREA_LABELS,
    areaFor,
    count,
    recordError,
    noteError,
    middleware,
    flush,
    start,
    report,
    unseenCount,
    markSeen,
    _setClock(fn) { now = fn || (() => Date.now()); },
};
