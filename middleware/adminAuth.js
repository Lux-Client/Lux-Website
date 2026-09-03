const crypto = require('crypto');
const { rateLimit } = require('express-rate-limit');

/* Everything that guards the admin master password lives here, so the rules
   cannot drift apart across the eight endpoints that used to check it by hand.
   Three problems this fixes:

   - the password was compared with ===, which leaks its length and prefix
     through timing,
   - it was accepted from the query string, where it ends up in access logs,
     proxy logs, browser history and the Referer header sent to other sites,
   - nothing limited how fast it could be guessed. */

// Constant-time comparison. Both branches do the same amount of work, so a
// wrong guess cannot be narrowed down by how long the answer took.
function passwordMatches(candidate, expected) {
    if (typeof candidate !== 'string' || typeof expected !== 'string' || !expected) return false;
    const a = Buffer.from(candidate, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length) {
        crypto.timingSafeEqual(b, b); // keep the reject path the same shape
        return false;
    }
    return crypto.timingSafeEqual(a, b);
}

// Body or header only — never req.query.
function readPassword(req) {
    const header = req.get && req.get('x-admin-password');
    if (typeof header === 'string' && header.length > 0) return header;
    if (req.body && typeof req.body.password === 'string') return req.body.password;
    return null;
}

// One budget per IP across every endpoint that can be probed with a guess.
// Successful requests are not counted, so an admin working normally never
// runs into it. Requires app.set('trust proxy', ...) to see the real client IP.
const adminAuthLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: (req, res) => {
        console.warn(`[AdminAuth] Rate limit hit from ${req.ip} on ${req.path}`);
        res.status(429).json({
            success: false,
            error: 'Too many attempts. Try again in 15 minutes.'
        });
    }
});

module.exports = function createAdminAuth(ADMIN_PASSWORD) {
    const isSessionAdmin = req =>
        typeof req.isAuthenticated === 'function' && req.isAuthenticated() && req.user?.role === 'admin';

    // Set once the master password has been verified, so the browser never has
    // to keep the password around and resend it with every request.
    const isUnlocked = req => !!req.session?.adminBypass;

    const submitsPassword = req => passwordMatches(readPassword(req), ADMIN_PASSWORD);

    function unlock(req) {
        if (req.session) req.session.adminBypass = true;
    }

    /* Gate for admin tooling: an admin account, an already unlocked session, or
       a correct password in the body/header. A correct password unlocks the
       session so later requests need nothing at all. */
    function adminOrPassword(req, res, next) {
        if (isSessionAdmin(req) || isUnlocked(req)) return next();
        if (submitsPassword(req)) {
            unlock(req);
            return next();
        }
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    return {
        adminAuthLimiter,
        adminOrPassword,
        isSessionAdmin,
        isUnlocked,
        submitsPassword,
        unlock,
        passwordMatches,
    };
};

module.exports.adminAuthLimiter = adminAuthLimiter;
module.exports.passwordMatches = passwordMatches;
module.exports.readPassword = readPassword;
