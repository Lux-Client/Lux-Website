const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const pool = require('./database');
require('dotenv').config();

passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Fields that must never reach the browser (GET /api/user sends req.user as is).
const PRIVATE_FIELDS = ['password_hash', 'totp_secret', 'totp_last_step', 'failed_logins', 'locked_until'];

function publicUser(row) {
    const user = { ...row, has_password: Boolean(row.password_hash) };
    for (const field of PRIVATE_FIELDS) delete user[field];
    return user;
}

passport.deserializeUser(async (id, done) => {
    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
        if (rows.length > 0) {
            done(null, publicUser(rows[0]));
        } else {
            done(null, false);
        }
    } catch (err) {
        done(err, null);
    }
});

console.log('[Passport] GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? 'Set' : 'MISSING');
if (!process.env.GOOGLE_CLIENT_ID) {
    console.error('[Passport] CRITICAL: GOOGLE_CLIENT_ID is not set in environment variables!');
}

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.CALLBACK_URL || "/auth/google/callback",
    proxy: true,
    passReqToCallback: true
},
    async (req, accessToken, refreshToken, profile, done) => {
        console.log(`[Google OAuth] Callback received for user: ${profile.displayName} (${profile.id})`);
        try {
            const now = new Date();
            console.log(`[Google OAuth] Querying database for google_id: ${profile.id}`);
            const [rows] = await pool.query('SELECT * FROM users WHERE google_id = ?', [profile.id]);

            if (rows.length > 0) {
                const user = rows[0];
                if (user.banned) {
                    if (user.ban_expires && new Date(user.ban_expires) < now) {

                        await pool.query('UPDATE users SET banned = FALSE, ban_reason = NULL, ban_expires = NULL WHERE id = ?', [user.id]);
                    } else {
                        return done(null, false, { message: user.ban_reason || 'You are banned from this platform.' });
                    }
                }
                await pool.query('UPDATE users SET last_login = ? WHERE id = ?', [now, user.id]);
                user.last_login = now;

                return done(null, user);
            }

            // An email account with the same address: link Google to it instead of creating a
            // second account. Google has verified the address. If the email account was never
            // confirmed, whoever set its password did not prove they own the address, so that
            // password is dropped.
            const googleEmail = profile.emails && profile.emails.length > 0 ? String(profile.emails[0].value).toLowerCase() : null;
            const emailVerifiedByGoogle = !profile.emails?.[0] || profile.emails[0].verified !== false;
            if (googleEmail && emailVerifiedByGoogle) {
                const [byEmail] = await pool.query(
                    'SELECT * FROM users WHERE LOWER(email) = ? AND google_id IS NULL ORDER BY id ASC',
                    [googleEmail]
                );
                if (byEmail.length > 0) {
                    const user = byEmail[0];
                    if (user.banned && !(user.ban_expires && new Date(user.ban_expires) < now)) {
                        return done(null, false, { message: user.ban_reason || 'You are banned from this platform.' });
                    }
                    if (user.email_verified) {
                        await pool.query('UPDATE users SET google_id = ?, last_login = ? WHERE id = ?', [profile.id, now, user.id]);
                    } else {
                        await pool.query(
                            'UPDATE users SET google_id = ?, email_verified = TRUE, password_hash = NULL, last_login = ? WHERE id = ?',
                            [profile.id, now, user.id]
                        );
                        user.password_hash = null;
                    }
                    user.google_id = profile.id;
                    console.log(`[Google OAuth] Linked Google to existing email account ${user.id}`);
                    return done(null, user);
                }
            }

            {
                let username = profile.displayName;
                const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
                if (existing.length > 0) {
                    username = `${profile.displayName}#${Math.floor(1000 + Math.random() * 9000)}`;
                }

                const newUser = {
                    google_id: profile.id,
                    username: username,
                    email: profile.emails && profile.emails.length > 0 ? profile.emails[0].value : null,
                    avatar: profile.photos && profile.photos.length > 0 ? profile.photos[0].value.substring(0, 1000) : null,
                    bio: 'Project Lux Client Member',
                    role: 'user',
                    last_login: now
                };

                const [result] = await pool.query(
                    'INSERT INTO users (google_id, username, email, avatar, bio, role, last_login, email_verified) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)',
                    [newUser.google_id, newUser.username, newUser.email, newUser.avatar, newUser.bio, newUser.role, newUser.last_login]
                );
                newUser.id = result.insertId;
                console.log(`[Google OAuth] New user created with ID: ${newUser.id} (username: ${newUser.username})`);
                return done(null, newUser);
            }
        } catch (err) {
            console.error('[Google OAuth] Authorization Error:', err);
            if (err.data) {
                try {
                    console.error('[Google OAuth] Error Data:', JSON.stringify(err.data, null, 2));
                } catch (e) {
                    console.error('[Google OAuth] Error Data (raw):', err.data);
                }
            }
            console.error('[Google OAuth] Error Stack:', err.stack);
            return done(err, null);
        }
    }));

module.exports = passport;
module.exports.publicUser = publicUser;
