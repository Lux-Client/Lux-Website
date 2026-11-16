// Outgoing mail goes through Resend's HTTPS API (api.resend.com, port 443). SMTP is not used
// because hosters usually block the SMTP ports.
//
// Environment:
//   RESEND_API_KEY         API key from resend.com -> API Keys (required to send anything)
//   RESEND_FROM            Sender, e.g. "Lux Client <noreply@pluginhub.de>" (domain must be verified in Resend)
//   EMAIL_DAILY_LIMIT      Emails per day before we stop sending (default 100, Resend free tier)
//   EMAIL_MONTHLY_LIMIT    Emails per month before we stop sending (default 3000, Resend free tier)
//   EMAIL_MONTH_RESET_DAY  Day of the month the monthly quota resets (default 1)
//   EMAIL_NOTIFICATIONS    "true" to also send moderation notifications (extension approved, ...).
//                          Off by default so the free quota is kept for sign-up and password mails.
//
// The quota is counted in the email_usage table (one row per day and per month, UTC). When a
// limit is reached, or Resend itself answers with daily_quota_exceeded / monthly_quota_exceeded,
// the period is marked blocked: registration closes and password reset mails are refused until
// the day (00:00 UTC) or the month rolls over.

const pool = require('./database');

const SITE_URL = (process.env.SITE_URL || 'https://lux.pluginhub.de').replace(/\/+$/, '');
// SMTP_PASS / SMTP_FROM are the old names from the SMTP setup (a Resend SMTP password is an API key).
const RESEND_API_KEY = process.env.RESEND_API_KEY || process.env.SMTP_PASS || '';
const RESEND_FROM = process.env.RESEND_FROM || process.env.SMTP_FROM || 'Lux Client <noreply@pluginhub.de>';
const DAILY_LIMIT = Math.max(0, Number(process.env.EMAIL_DAILY_LIMIT || 100));
const MONTHLY_LIMIT = Math.max(0, Number(process.env.EMAIL_MONTHLY_LIMIT || 3000));
const MONTH_RESET_DAY = Math.min(28, Math.max(1, Number(process.env.EMAIL_MONTH_RESET_DAY || 1)));
const NOTIFICATIONS_ENABLED = process.env.EMAIL_NOTIFICATIONS === 'true';
// Without an API key outside production, mails are printed to the console so the flows can be tried locally.
const DEV_CONSOLE = !RESEND_API_KEY
    && (process.env.EMAIL_DEV_CONSOLE === 'true' || ['development', 'test'].includes(process.env.NODE_ENV));

if (!RESEND_API_KEY) {
    console.warn(DEV_CONSOLE
        ? '[Email] RESEND_API_KEY not set: emails are printed to the console (development only).'
        : '[Email] RESEND_API_KEY not set: no emails can be sent, email sign-up is closed.');
}

let transport = defaultTransport;
let now = () => new Date();

// ── quota periods ───────────────────────────────────────────────────────────

function pad(n) { return String(n).padStart(2, '0'); }

function periods(date = now()) {
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth();
    const d = date.getUTCDate();
    const dayKey = `d:${y}-${pad(m + 1)}-${pad(d)}`;
    const dayEnds = new Date(Date.UTC(y, m, d + 1));

    // The monthly quota period starts on MONTH_RESET_DAY.
    let startY = y;
    let startM = m;
    if (d < MONTH_RESET_DAY) {
        startM -= 1;
        if (startM < 0) { startM = 11; startY -= 1; }
    }
    const monthKey = `m:${startY}-${pad(startM + 1)}`;
    const monthEnds = new Date(Date.UTC(startY, startM + 1, MONTH_RESET_DAY));
    return { dayKey, dayEnds, monthKey, monthEnds };
}

async function ensureRow(period) {
    await pool.query(
        'INSERT INTO email_usage (period, sent, blocked) VALUES (?, 0, FALSE) ON CONFLICT (period) DO NOTHING RETURNING period',
        [period]
    );
}

async function readRow(period) {
    const [rows] = await pool.query('SELECT period, sent, blocked FROM email_usage WHERE period = ?', [period]);
    return rows[0] || { period, sent: 0, blocked: false };
}

// Whether emails can be sent right now, and if not, why and until when.
async function getStatus() {
    if (!RESEND_API_KEY && !DEV_CONSOLE) {
        return { available: false, reason: 'not_configured', resumesAt: null };
    }
    const p = periods();
    const [day, month] = await Promise.all([readRow(p.dayKey), readRow(p.monthKey)]);
    const monthFull = month.blocked || Number(month.sent) >= MONTHLY_LIMIT;
    const dayFull = day.blocked || Number(day.sent) >= DAILY_LIMIT;
    // The monthly limit wins: it lasts longer.
    if (monthFull) return { available: false, reason: 'monthly', resumesAt: p.monthEnds.toISOString() };
    if (dayFull) return { available: false, reason: 'daily', resumesAt: p.dayEnds.toISOString() };
    return {
        available: true,
        reason: null,
        resumesAt: null,
        remainingToday: DAILY_LIMIT - Number(day.sent),
        remainingThisMonth: MONTHLY_LIMIT - Number(month.sent),
    };
}

// Takes one email from both quotas, or none if either is used up.
async function reserve(p) {
    await ensureRow(p.dayKey);
    await ensureRow(p.monthKey);
    const [dayRes] = await pool.query(
        'UPDATE email_usage SET sent = sent + 1, updated_at = NOW() WHERE period = ? AND blocked = FALSE AND sent < ?',
        [p.dayKey, DAILY_LIMIT]
    );
    if (!dayRes.affectedRows) return false;
    const [monthRes] = await pool.query(
        'UPDATE email_usage SET sent = sent + 1, updated_at = NOW() WHERE period = ? AND blocked = FALSE AND sent < ?',
        [p.monthKey, MONTHLY_LIMIT]
    );
    if (!monthRes.affectedRows) {
        await refund(p, { month: false });
        return false;
    }
    return true;
}

async function refund(p, { day = true, month = true } = {}) {
    if (day) await pool.query('UPDATE email_usage SET sent = sent - 1 WHERE period = ? AND sent > 0', [p.dayKey]);
    if (month) await pool.query('UPDATE email_usage SET sent = sent - 1 WHERE period = ? AND sent > 0', [p.monthKey]);
}

async function block(period) {
    await ensureRow(period);
    await pool.query('UPDATE email_usage SET blocked = TRUE, updated_at = NOW() WHERE period = ?', [period]);
}

// ── Resend HTTP API ─────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function defaultTransport(message) {
    if (DEV_CONSOLE) {
        console.log(`\n[Email] (console) To: ${message.to}\nSubject: ${message.subject}\n${message.text || ''}\n`);
        return { ok: true, id: 'console' };
    }
    for (let attempt = 0; attempt < 3; attempt++) {
        let res;
        try {
            res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${RESEND_API_KEY}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'lux-website',
                },
                body: JSON.stringify({
                    from: RESEND_FROM,
                    to: [message.to],
                    subject: message.subject,
                    html: message.html,
                    text: message.text,
                }),
                signal: AbortSignal.timeout(15000),
            });
        } catch (err) {
            return { ok: false, error: 'network', message: err.message };
        }
        if (res.ok) {
            const body = await res.json().catch(() => ({}));
            return { ok: true, id: body.id || null };
        }
        const body = await res.json().catch(() => ({}));
        const name = String(body.name || '');
        const text = `${name} ${body.message || ''}`.toLowerCase();
        if (res.status === 429 && (name === 'daily_quota_exceeded' || /daily/.test(text))) {
            return { ok: false, error: 'daily_quota', message: body.message };
        }
        if (res.status === 429 && (name === 'monthly_quota_exceeded' || /monthly/.test(text))) {
            return { ok: false, error: 'monthly_quota', message: body.message };
        }
        if (res.status === 429 && attempt < 2) {
            // Plain request rate limit (a few requests per second): wait and try again.
            await sleep(1100 * (attempt + 1));
            continue;
        }
        return { ok: false, error: 'http', status: res.status, message: body.message || name };
    }
    return { ok: false, error: 'http', status: 429, message: 'rate limited' };
}

// a***@example.com: enough to recognise a support case, without keeping full addresses.
function maskAddress(address) {
    const [local, domain] = String(address || '').split('@');
    if (!domain) return null;
    return `${local.slice(0, 1)}***@${domain}`.slice(0, 120);
}

async function logStart(kind, to, subject) {
    try {
        const [res] = await pool.query(
            'INSERT INTO email_log (kind, recipient, subject, status) VALUES (?, ?, ?, ?)',
            [kind, maskAddress(to), String(subject || '').slice(0, 200), 'sending']
        );
        return res.insertId;
    } catch (err) {
        console.error('[Email] Could not write the email log:', err.message);
        return null;
    }
}

async function logEnd(id, status, { reason = null, error = null, providerId = null } = {}) {
    if (!id) return;
    await pool.query(
        'UPDATE email_log SET status = ?, reason = ?, error = ?, provider_id = ?, updated_at = NOW() WHERE id = ?',
        [status, reason, error ? String(error).slice(0, 1000) : null, providerId, id]
    ).catch((err) => console.error('[Email] Could not update the email log:', err.message));
}

function monitor() {
    // Loaded lazily: monitoring.js and email.js both use the database module.
    try { return require('./monitoring'); } catch { return null; }
}

// Sends one email. Returns { sent: true } or { sent: false, reason }, where reason is
// 'daily' / 'monthly' (quota used up), 'not_configured', 'no_recipient' or 'send_failed'.
// kind names the email in the admin panel (verify, reset, security, ...).
async function sendEmail({ to, subject, html, text, kind = 'other' }) {
    if (!to) return { sent: false, reason: 'no_recipient' };
    const logId = await logStart(kind, to, subject);
    const m = monitor();

    if (!RESEND_API_KEY && !DEV_CONSOLE) {
        await logEnd(logId, 'skipped', { reason: 'not_configured', error: 'RESEND_API_KEY is not set' });
        return { sent: false, reason: 'not_configured' };
    }

    const p = periods();
    let reserved;
    try {
        reserved = await reserve(p);
    } catch (err) {
        console.error('[Email] Quota check failed:', err.message);
        await logEnd(logId, 'failed', { reason: 'quota_check', error: err.message });
        if (m) { m.count('email', false); m.recordError({ area: 'email', message: `Quota check failed: ${err.message}` }); }
        return { sent: false, reason: 'send_failed' };
    }
    if (!reserved) {
        const status = await getStatus().catch(() => ({ reason: 'daily' }));
        console.warn(`[Email] Not sending "${subject}": ${status.reason} limit reached.`);
        await logEnd(logId, 'skipped', { reason: `${status.reason || 'daily'}_limit`, error: `The ${status.reason || 'daily'} email limit is used up` });
        return { sent: false, reason: status.reason || 'daily' };
    }

    let result;
    try {
        result = await transport({ to, subject, html, text });
    } catch (err) {
        result = { ok: false, error: 'exception', message: err.message };
    }
    if (result.ok) {
        await logEnd(logId, 'sent', { providerId: result.id || null });
        if (m) m.count('email', true);
        return { sent: true, id: result.id };
    }

    if (result.error === 'daily_quota' || result.error === 'monthly_quota') {
        const which = result.error === 'daily_quota' ? 'daily' : 'monthly';
        await block(which === 'daily' ? p.dayKey : p.monthKey).catch(() => {});
        console.warn(`[Email] Resend reports the ${which} quota is used up, sending paused until it resets.`);
        await logEnd(logId, 'failed', { reason: `resend_${which}_quota`, error: result.message || `Resend: ${which} quota exceeded` });
        if (m) {
            m.count('email', false);
            m.recordError({ area: 'email', status: 429, message: `Resend ${which} quota exceeded, email sending paused` });
        }
        return { sent: false, reason: which };
    }
    await refund(p).catch(() => {});
    const reason = result.error === 'http' ? `http_${result.status}` : (result.error || 'unknown');
    const message = result.message || result.error || 'unknown error';
    console.error(`[Email] Failed to send "${subject}":`, message);
    await logEnd(logId, 'failed', { reason, error: message });
    if (m) {
        m.count('email', false);
        m.recordError({ area: 'email', status: result.status || null, message: `Sending "${subject}" failed (${reason}): ${message}` });
    }
    return { sent: false, reason: 'send_failed' };
}

// Numbers for the admin panel.
async function report() {
    const status = await getStatus().catch(() => ({ available: false, reason: 'error' }));
    const p = periods();
    const [day, month] = await Promise.all([readRow(p.dayKey), readRow(p.monthKey)]);
    const since24 = new Date(now().getTime() - 24 * 60 * 60 * 1000);
    const since30 = new Date(now().getTime() - 30 * 24 * 60 * 60 * 1000);
    const [byStatus] = await pool.query(
        `SELECT status, SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS last24, COUNT(*) AS last30
         FROM email_log WHERE created_at >= ? GROUP BY status`,
        [since24, since30]
    );
    const [byReason] = await pool.query(
        `SELECT reason, status, COUNT(*) AS n, MAX(created_at) AS last_at FROM email_log
         WHERE created_at >= ? AND status IN ('failed', 'skipped') GROUP BY reason, status ORDER BY n DESC`,
        [since30]
    );
    const [byKind] = await pool.query(
        'SELECT kind, COUNT(*) AS n FROM email_log WHERE created_at >= ? GROUP BY kind ORDER BY n DESC',
        [since30]
    );
    const [recent] = await pool.query(
        'SELECT id, kind, recipient, subject, status, reason, error, created_at, updated_at FROM email_log ORDER BY created_at DESC LIMIT 100'
    );
    const stuckBefore = now().getTime() - 5 * 60 * 1000;
    const counts = { sending: { last24: 0, last30: 0 }, sent: { last24: 0, last30: 0 }, failed: { last24: 0, last30: 0 }, skipped: { last24: 0, last30: 0 } };
    for (const r of byStatus) counts[r.status] = { last24: Number(r.last24 || 0), last30: Number(r.last30 || 0) };
    return {
        configured: Boolean(RESEND_API_KEY),
        devConsole: DEV_CONSOLE,
        status,
        quota: {
            daily: { used: Number(day.sent || 0), limit: DAILY_LIMIT, blocked: Boolean(day.blocked), resetsAt: p.dayEnds.toISOString() },
            monthly: { used: Number(month.sent || 0), limit: MONTHLY_LIMIT, blocked: Boolean(month.blocked), resetsAt: p.monthEnds.toISOString() },
        },
        counts,
        stuck: recent.filter((r) => r.status === 'sending' && new Date(r.created_at).getTime() < stuckBefore).length,
        reasons: byReason.map((r) => ({ reason: r.reason || 'unknown', status: r.status, count: Number(r.n), lastAt: r.last_at })),
        kinds: byKind.map((r) => ({ kind: r.kind, count: Number(r.n) })),
        recent,
    };
}

// ── templates ───────────────────────────────────────────────────────────────

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const layout = (title, bodyHtml, footer = "You're receiving this because of activity on your Lux Client account.") => `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; background: #0a0a0a; padding: 32px 16px;">
        <div style="max-width: 480px; margin: 0 auto; background: #0f0f0f; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 32px;">
            <p style="color: #e27602; font-weight: 800; font-size: 12px; letter-spacing: 0.15em; text-transform: uppercase; margin: 0 0 16px;">Lux Client</p>
            <h1 style="color: #fff; font-size: 20px; margin: 0 0 16px;">${title}</h1>
            <div style="color: #ccc; font-size: 14px; line-height: 1.6;">${bodyHtml}</div>
            <p style="color: #666; font-size: 11px; margin-top: 32px;">${footer}</p>
        </div>
    </div>
`;

const button = (href, label) =>
    `<p style="margin: 24px 0;"><a href="${href}" style="display: inline-block; background: #e27602; color: #000; font-weight: 700; text-decoration: none; padding: 12px 20px; border-radius: 10px;">${label}</a></p>
     <p style="color: #888; font-size: 12px;">Or open this link: <br><a href="${href}" style="color: #e27602; word-break: break-all;">${href}</a></p>`;

function sendVerificationEmail({ to, username, token }) {
    const link = `${SITE_URL}/verify-email?token=${encodeURIComponent(token)}`;
    return sendEmail({
        to,
        kind: 'verify',
        subject: 'Confirm your Lux account',
        html: layout('Confirm your email', `
            <p>Hi <strong>${escapeHtml(username)}</strong>, thanks for creating a Lux account. Confirm your email address to finish signing up.</p>
            ${button(link, 'Confirm email')}
            <p style="color: #888; font-size: 12px;">The link is valid for 24 hours. If you didn't sign up, you can ignore this email.</p>
        `, 'You received this because someone signed up for Lux Client with this address.'),
        text: `Hi ${username}, confirm your Lux account: ${link}\nThe link is valid for 24 hours. If you didn't sign up, ignore this email.`,
    });
}

function sendPasswordResetEmail({ to, username, token }) {
    const link = `${SITE_URL}/reset-password?token=${encodeURIComponent(token)}`;
    return sendEmail({
        to,
        kind: 'reset',
        subject: 'Reset your Lux password',
        html: layout('Reset your password', `
            <p>Hi <strong>${escapeHtml(username)}</strong>, someone asked to reset the password of your Lux account.</p>
            ${button(link, 'Choose a new password')}
            <p style="color: #888; font-size: 12px;">The link is valid for 1 hour and works once. If this wasn't you, ignore this email: your password stays the same.</p>
        `),
        text: `Hi ${username}, reset your Lux password: ${link}\nThe link is valid for 1 hour. If this wasn't you, ignore this email.`,
    });
}

function sendAlreadyRegisteredEmail({ to, username }) {
    const login = `${SITE_URL}/login`;
    const forgot = `${SITE_URL}/forgot-password`;
    return sendEmail({
        to,
        kind: 'already_registered',
        subject: 'You already have a Lux account',
        html: layout('You already have an account', `
            <p>Hi <strong>${escapeHtml(username)}</strong>, someone tried to sign up with this email address, but it already belongs to your Lux account.</p>
            <p><a href="${login}" style="color: #e27602;">Sign in</a> or <a href="${forgot}" style="color: #e27602;">reset your password</a>. If this wasn't you, you can ignore this email.</p>
        `),
        text: `Hi ${username}, this email already has a Lux account. Sign in: ${login} or reset your password: ${forgot}`,
    });
}

function sendSecurityNotice({ to, username, what }) {
    return sendEmail({
        to,
        kind: 'security',
        subject: `Lux account: ${what}`,
        html: layout('Security notice', `
            <p>Hi <strong>${escapeHtml(username)}</strong>, this is a notice that on your Lux account: <strong>${escapeHtml(what)}</strong>.</p>
            <p>If this wasn't you, <a href="${SITE_URL}/forgot-password" style="color: #e27602;">reset your password</a> right away.</p>
        `),
        text: `Hi ${username}, on your Lux account: ${what}. If this wasn't you, reset your password: ${SITE_URL}/forgot-password`,
    });
}

// Moderation notifications are optional (EMAIL_NOTIFICATIONS=true) to spare the quota.
function notify(user, subject, title, bodyHtml) {
    if (!NOTIFICATIONS_ENABLED) return Promise.resolve({ sent: false, reason: 'disabled' });
    return sendEmail({ to: user && user.email, subject, html: layout(title, bodyHtml), kind: 'moderation' });
}

function notifyExtensionApproved(user, extensionName, identifier) {
    return notify(user, `"${extensionName}" was approved`, 'Your project is live 🎉', `
        <p>Good news, <strong>${escapeHtml(user.username)}</strong> — <strong>${escapeHtml(extensionName)}</strong> just got approved and is now visible on the marketplace.</p>
        <p><a href="${SITE_URL}/extensions/${encodeURIComponent(identifier)}" style="color: #e27602;">View it live →</a></p>
    `);
}

function notifyExtensionRejected(user, extensionName, reason) {
    return notify(user, `"${extensionName}" was rejected`, 'Submission rejected', `
        <p>Hi <strong>${escapeHtml(user.username)}</strong>, unfortunately <strong>${escapeHtml(extensionName)}</strong> was not approved.</p>
        <p><strong>Reason:</strong> ${escapeHtml(reason || 'No reason specified')}</p>
        <p>You're welcome to fix the issue and resubmit from your dashboard.</p>
    `);
}

function notifyActionRequired(user, extensionName, reason) {
    return notify(user, `Action required for "${extensionName}"`, 'Action required', `
        <p>Hi <strong>${escapeHtml(user.username)}</strong>, <strong>${escapeHtml(extensionName)}</strong> needs a change before it can be approved.</p>
        <p><strong>Feedback:</strong> ${escapeHtml(reason || 'No reason specified')}</p>
    `);
}

function notifyUserWarned(user, reason) {
    return notify(user, 'You have received a warning', 'Account warning',
        `<p>Hi <strong>${escapeHtml(user.username)}</strong>, you've received a warning.</p><p><strong>Reason:</strong> ${escapeHtml(reason)}</p>`);
}

function notifyUserBanned(user, reason) {
    return notify(user, 'Your account has been banned', 'Account banned',
        `<p>Hi <strong>${escapeHtml(user.username)}</strong>, your account has been banned.</p><p><strong>Reason:</strong> ${escapeHtml(reason)}</p>`);
}

module.exports = {
    EMAIL_ENABLED: Boolean(RESEND_API_KEY) || DEV_CONSOLE,
    DAILY_LIMIT,
    MONTHLY_LIMIT,
    getStatus,
    report,
    maskAddress,
    sendEmail,
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendAlreadyRegisteredEmail,
    sendSecurityNotice,
    notifyExtensionApproved,
    notifyExtensionRejected,
    notifyActionRequired,
    notifyUserWarned,
    notifyUserBanned,
    // tests only
    _setTransport(fn) { transport = fn || defaultTransport; },
    _setClock(fn) { now = fn || (() => new Date()); },
    _periods: periods,
};
