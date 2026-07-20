const nodemailer = require('nodemailer');

// Off by default until SMTP credentials are actually configured, so this can ship without
// silently trying (and failing) to send mail. Flip EMAIL_ENABLED=true in .env once SMTP_PASS/
// SMTP_FROM are set (from Resend's API Keys page) — no code changes needed.
// Host/port/user default to Resend's relay since that's the provider we're using; override
// via SMTP_HOST/SMTP_PORT/SMTP_USER only if you ever switch providers.
const EMAIL_ENABLED = process.env.EMAIL_ENABLED === 'true';
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.resend.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || 'resend';
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM;
const SITE_URL = process.env.SITE_URL || 'https://lux.pluginhub.de';

let transporter = null;
function getTransporter() {
    if (transporter) return transporter;
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
    transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    return transporter;
}

const layout = (title, bodyHtml) => `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; background: #0a0a0a; padding: 32px 16px;">
        <div style="max-width: 480px; margin: 0 auto; background: #0f0f0f; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 32px;">
            <p style="color: #e27602; font-weight: 800; font-size: 12px; letter-spacing: 0.15em; text-transform: uppercase; margin: 0 0 16px;">Lux Client</p>
            <h1 style="color: #fff; font-size: 20px; margin: 0 0 16px;">${title}</h1>
            <div style="color: #ccc; font-size: 14px; line-height: 1.6;">${bodyHtml}</div>
            <p style="color: #666; font-size: 11px; margin-top: 32px;">
                You're receiving this because of activity on your Lux Client account.
                <a href="${SITE_URL}/opt-out" style="color: #e27602;">Manage notification preferences</a>
            </p>
        </div>
    </div>
`;

async function sendEmail({ to, subject, html }) {
    if (!EMAIL_ENABLED) {
        console.log(`[Email] (disabled) Would send "${subject}" to ${to}`);
        return { sent: false, reason: 'disabled' };
    }
    const client = getTransporter();
    if (!client || !to || !SMTP_FROM) {
        console.warn(`[Email] Skipped "${subject}" to ${to || '(no address)'} — SMTP not fully configured or no recipient.`);
        return { sent: false, reason: 'not_configured' };
    }
    try {
        await client.sendMail({ from: SMTP_FROM, to, subject, html });
        return { sent: true };
    } catch (err) {
        console.error(`[Email] Failed to send "${subject}" to ${to}:`, err.message);
        return { sent: false, reason: 'send_failed' };
    }
}

function notifyExtensionApproved(user, extensionName, identifier) {
    return sendEmail({
        to: user.email,
        subject: `"${extensionName}" was approved`,
        html: layout('Your project is live 🎉', `
            <p>Good news, <strong>${user.username}</strong> — <strong>${extensionName}</strong> just got approved and is now visible on the marketplace.</p>
            <p><a href="${SITE_URL}/extensions/${identifier}" style="color: #e27602;">View it live →</a></p>
        `),
    });
}

function notifyExtensionRejected(user, extensionName, reason) {
    return sendEmail({
        to: user.email,
        subject: `"${extensionName}" was rejected`,
        html: layout('Submission rejected', `
            <p>Hi <strong>${user.username}</strong>, unfortunately <strong>${extensionName}</strong> was not approved.</p>
            <p><strong>Reason:</strong> ${reason || 'No reason specified'}</p>
            <p>You're welcome to fix the issue and resubmit from your dashboard.</p>
        `),
    });
}

function notifyActionRequired(user, extensionName, reason) {
    return sendEmail({
        to: user.email,
        subject: `Action required for "${extensionName}"`,
        html: layout('Action required', `
            <p>Hi <strong>${user.username}</strong>, <strong>${extensionName}</strong> needs a change before it can be approved.</p>
            <p><strong>Feedback:</strong> ${reason || 'No reason specified'}</p>
        `),
    });
}

function notifyUserWarned(user, reason) {
    return sendEmail({
        to: user.email,
        subject: 'You have received a warning',
        html: layout('Account warning', `<p>Hi <strong>${user.username}</strong>, you've received a warning.</p><p><strong>Reason:</strong> ${reason}</p>`),
    });
}

function notifyUserBanned(user, reason) {
    return sendEmail({
        to: user.email,
        subject: 'Your account has been banned',
        html: layout('Account banned', `<p>Hi <strong>${user.username}</strong>, your account has been banned.</p><p><strong>Reason:</strong> ${reason}</p>`),
    });
}

module.exports = {
    EMAIL_ENABLED,
    sendEmail,
    notifyExtensionApproved,
    notifyExtensionRejected,
    notifyActionRequired,
    notifyUserWarned,
    notifyUserBanned,
};
