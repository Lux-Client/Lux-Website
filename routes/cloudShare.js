// Zusammenarbeit an Cloud-Instanzen: Mitglieder verwalten, geteilte Instanzen auflisten
// und nachsehen, wer welche Mod hinzugefuegt hat. Die eigentliche Zugriffsgrenze (was ein
// Mitglied sehen und aendern darf) steht in ../cloudShare.js.

const express = require('express');
const pool = require('../database');
const { cloudError, ensureCloudUser } = require('../middleware/deviceAuth');
const { INSTANCE_UUID_RE, cleanText } = require('../cloudConfig');
const { INSTANCE_COLUMNS, decorate } = require('../cloudInstances');
const {
    MAX_MEMBERS,
    PERMISSIONS,
    accessibleInstance,
    defaultPermissions,
    parsePermissionPatch,
    permissionsFromRow,
    serializeForViewer
} = require('../cloudShare');

const MEMBER_PERMISSION_COLUMNS = Object.values(PERMISSIONS).map((entry) => `m.${entry.column}`).join(', ');

const router = express.Router();

// Bewusst schlicht: ein @, kein Leerzeichen, ein Punkt in der Domain. Ob es die Adresse
// wirklich gibt, entscheidet ohnehin die Frage, ob ein Lux-Konto sie benutzt.
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,63}$/;

function publicUser(row) {
    return {
        userId: Number(row.user_id || row.id),
        username: row.username,
        avatar: row.avatar || null
    };
}

async function requireAccess(req, res) {
    if (!INSTANCE_UUID_RE.test(String(req.params.uuid))) {
        cloudError(res, 404, 'not_found', 'Instance not found');
        return null;
    }
    const instance = await accessibleInstance(req.cloudUserId, String(req.params.uuid));
    if (!instance) {
        cloudError(res, 404, 'not_found', 'Instance not found');
        return null;
    }
    return instance;
}

async function listMembers(instanceId) {
    const [rows] = await pool.query(
        `SELECT m.user_id, m.role, m.created_at, u.username, u.avatar, u.email, ${MEMBER_PERMISSION_COLUMNS}
           FROM cloud_instance_members m
           JOIN users u ON u.id = m.user_id
          WHERE m.instance_id = ?
          ORDER BY m.created_at ASC`,
        [instanceId]
    );
    return rows;
}

async function ownerOf(instance) {
    const [rows] = await pool.query('SELECT id, username, avatar FROM users WHERE id = ?', [instance.owner_id]);
    return rows[0] ? publicUser(rows[0]) : { userId: instance.owner_id, username: null, avatar: null };
}

async function membersPayload(instance, viewerId) {
    const members = await listMembers(instance.id);
    const isOwner = instance.access === 'owner';
    return {
        access: instance.access,
        maxMembers: MAX_MEMBERS,
        // Was der Betrachter selbst darf -- der Launcher blendet danach Knoepfe aus.
        permissions: instance.permissions,
        owner: await ownerOf(instance),
        members: members.map((row) => ({
            ...publicUser(row),
            role: row.role,
            addedAt: row.created_at,
            isMe: Number(row.user_id) === Number(viewerId),
            permissions: permissionsFromRow(row),
            // Die E-Mail-Adressen der anderen sieht nur der Host, der sie eingetragen hat.
            email: isOwner ? row.email : undefined
        }))
    };
}

router.get('/shared', ensureCloudUser, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT ${INSTANCE_COLUMNS}, i.user_id, m.created_at AS joined_at, ${MEMBER_PERMISSION_COLUMNS},
                    u.username AS owner_username, u.avatar AS owner_avatar
               FROM cloud_instance_members m
               JOIN cloud_instances i ON i.id = m.instance_id
               JOIN users u ON u.id = i.user_id
              WHERE m.user_id = ? AND i.status = ?
              ORDER BY i.last_touched_at DESC`,
            [req.cloudUserId, 'active']
        );
        const decorated = await decorate(rows);
        return res.json({
            instances: decorated.map((row) => serializeForViewer({ ...row, access: 'member' }, {
                owner: { userId: Number(row.user_id), username: row.owner_username, avatar: row.owner_avatar || null },
                joinedAt: row.joined_at,
                permissions: permissionsFromRow(row)
            }))
        });
    } catch (err) {
        console.error('[LuxCloud] GET /shared failed:', err);
        return cloudError(res, 500, 'server_error', 'Could not list shared instances');
    }
});

router.get('/instances/:uuid/members', ensureCloudUser, async (req, res) => {
    try {
        const instance = await requireAccess(req, res);
        if (!instance) return null;
        return res.json(await membersPayload(instance, req.cloudUserId));
    } catch (err) {
        console.error('[LuxCloud] GET /members failed:', err);
        return cloudError(res, 500, 'server_error', 'Could not list members');
    }
});

router.post('/instances/:uuid/members', ensureCloudUser, async (req, res) => {
    const email = typeof (req.body && req.body.email) === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!EMAIL_RE.test(email) || email.length > 100) {
        return cloudError(res, 400, 'invalid_email', 'That is not a valid email address');
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const instance = await accessibleInstance(req.cloudUserId, String(req.params.uuid), { executor: connection });
        if (!instance || !INSTANCE_UUID_RE.test(String(req.params.uuid))) {
            await connection.rollback();
            return cloudError(res, 404, 'not_found', 'Instance not found');
        }
        if (instance.access !== 'owner' && !instance.permissions.manageMembers) {
            await connection.rollback();
            return cloudError(res, 403, 'forbidden', 'The host has not allowed you to invite people');
        }

        let permissions = defaultPermissions();
        if (req.body && req.body.permissions !== undefined) {
            const patch = parsePermissionPatch(req.body.permissions);
            if (!patch) {
                await connection.rollback();
                return cloudError(res, 400, 'invalid_request', 'Unknown or malformed permissions');
            }
            // Wer nicht Host ist, verteilt keine Rechte -- auch keine, die er selbst hat.
            if (instance.access !== 'owner') {
                await connection.rollback();
                return cloudError(res, 403, 'forbidden', 'Only the host can set permissions');
            }
            permissions = { ...permissions, ...patch };
        }

        const [users] = await connection.query(
            'SELECT id, username, avatar, email, banned, cloud_banned FROM users WHERE LOWER(email) = ? ORDER BY id LIMIT 1',
            [email]
        );
        const target = users[0];
        if (!target) {
            await connection.rollback();
            return cloudError(res, 404, 'user_not_found', 'No Lux account uses this email address');
        }
        if (Number(target.id) === Number(req.cloudUserId)) {
            await connection.rollback();
            return cloudError(res, 400, 'invalid_request', 'You are already the host of this instance');
        }
        if (target.banned || target.cloud_banned) {
            await connection.rollback();
            return cloudError(res, 409, 'user_unavailable', 'This account cannot use Lux Cloud right now');
        }

        const [existing] = await connection.query(
            'SELECT 1 AS ok FROM cloud_instance_members WHERE instance_id = ? AND user_id = ?',
            [instance.id, target.id]
        );
        if (existing.length > 0) {
            await connection.rollback();
            return cloudError(res, 409, 'already_member', 'This account already works on this instance');
        }

        const [countRows] = await connection.query(
            'SELECT COUNT(*) AS count FROM cloud_instance_members WHERE instance_id = ?',
            [instance.id]
        );
        if (Number(countRows[0] ? countRows[0].count : 0) >= MAX_MEMBERS) {
            await connection.rollback();
            return cloudError(res, 409, 'member_limit_reached', `At most ${MAX_MEMBERS} people can work on one instance`, {
                details: { maxMembers: MAX_MEMBERS }
            });
        }

        const columns = Object.values(PERMISSIONS).map((entry) => entry.column);
        await connection.query(
            `INSERT INTO cloud_instance_members (instance_id, user_id, role, invited_by, ${columns.join(', ')})
             VALUES (?, ?, 'editor', ?, ${columns.map(() => '?').join(', ')})
             RETURNING user_id`,
            [instance.id, target.id, req.cloudUserId, ...Object.keys(PERMISSIONS).map((key) => permissions[key])]
        );
        await connection.query(
            'INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)',
            [
                target.id,
                `${req.cloudUser.username || 'Someone'} added you to the instance "${instance.name}". You find it under Shared Instances in the Lux launcher.`,
                'info'
            ]
        );

        await connection.commit();
        return res.status(201).json(await membersPayload(instance, req.cloudUserId));
    } catch (err) {
        await connection.rollback().catch(() => {});
        console.error('[LuxCloud] POST /members failed:', err);
        return cloudError(res, 500, 'server_error', 'Could not add the member');
    } finally {
        connection.release();
    }
});

router.delete('/instances/:uuid/members/:userId', ensureCloudUser, async (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
        return cloudError(res, 400, 'invalid_request', 'Bad user id');
    }

    try {
        const instance = await requireAccess(req, res);
        if (!instance) return null;

        // Der Host entfernt jeden, ein Mitglied sich selbst ("Verlassen"). Wer Leute
        // einladen darf, darf sie auch wieder entfernen -- aber niemanden mit demselben
        // Recht, sonst koennten sich zwei Mitglieder gegenseitig hinauswerfen.
        const leaving = Number(userId) === Number(req.cloudUserId);
        if (instance.access !== 'owner' && !leaving) {
            if (!instance.permissions.manageMembers) {
                return cloudError(res, 403, 'forbidden', 'Only the host can remove other people');
            }
            const [targetRows] = await pool.query(
                'SELECT can_manage_members FROM cloud_instance_members WHERE instance_id = ? AND user_id = ?',
                [instance.id, userId]
            );
            if (targetRows[0] && targetRows[0].can_manage_members) {
                return cloudError(res, 403, 'forbidden', 'Only the host can remove this person');
            }
        }

        const [result] = await pool.query(
            'DELETE FROM cloud_instance_members WHERE instance_id = ? AND user_id = ?',
            [instance.id, userId]
        );
        if (!result || result.affectedRows === 0) {
            return cloudError(res, 404, 'not_found', 'This account is not a member of the instance');
        }

        if (!leaving) {
            await pool.query(
                'INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)',
                [userId, `You were removed from the shared instance "${instance.name}".`, 'info']
            ).catch(() => {});
        }

        if (leaving && instance.access !== 'owner') {
            return res.json({ ok: true, left: true });
        }
        return res.json({ ok: true, ...(await membersPayload(instance, req.cloudUserId)) });
    } catch (err) {
        console.error('[LuxCloud] DELETE /members failed:', err);
        return cloudError(res, 500, 'server_error', 'Could not remove the member');
    }
});

router.get('/instances/:uuid/authors', ensureCloudUser, async (req, res) => {
    try {
        const instance = await requireAccess(req, res);
        if (!instance) return null;

        const [rows] = await pool.query(
            `SELECT a.path, a.user_id, a.revision, a.updated_at, u.username, u.avatar
               FROM cloud_entry_authors a
               LEFT JOIN users u ON u.id = a.user_id
              WHERE a.instance_id = ?`,
            [instance.id]
        );

        const authors = {};
        for (const row of rows) {
            authors[row.path] = {
                userId: row.user_id === null ? null : Number(row.user_id),
                username: row.username || null,
                avatar: row.avatar || null,
                revision: Number(row.revision),
                updatedAt: row.updated_at
            };
        }
        return res.json({
            owner: await ownerOf(instance),
            access: instance.access,
            permissions: instance.permissions,
            name: instance.name,
            authors
        });
    } catch (err) {
        console.error('[LuxCloud] GET /authors failed:', err);
        return cloudError(res, 500, 'server_error', 'Could not read the authors');
    }
});

// Rechte eines Mitglieds aendern. Nur der Host.
router.patch('/instances/:uuid/members/:userId', ensureCloudUser, async (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
        return cloudError(res, 400, 'invalid_request', 'Bad user id');
    }
    const patch = parsePermissionPatch(req.body && req.body.permissions);
    if (!patch) {
        return cloudError(res, 400, 'invalid_request', 'Unknown or malformed permissions');
    }

    try {
        const instance = await requireAccess(req, res);
        if (!instance) return null;
        if (instance.access !== 'owner') {
            return cloudError(res, 403, 'forbidden', 'Only the host can change permissions');
        }

        const assignments = Object.keys(patch).map((key) => `${PERMISSIONS[key].column} = ?`);
        const [result] = await pool.query(
            `UPDATE cloud_instance_members SET ${assignments.join(', ')} WHERE instance_id = ? AND user_id = ?`,
            [...Object.values(patch), instance.id, userId]
        );
        if (!result || result.affectedRows === 0) {
            return cloudError(res, 404, 'not_found', 'This account is not a member of the instance');
        }
        return res.json(await membersPayload(instance, req.cloudUserId));
    } catch (err) {
        console.error('[LuxCloud] PATCH /members failed:', err);
        return cloudError(res, 500, 'server_error', 'Could not change the permissions');
    }
});

// Eine Instanz umbenennen: der Host immer, Mitglieder nur mit dem Recht dazu. Der Name
// gilt dann fuer alle -- Commits ueberschreiben ihn bei gemeinsamen Instanzen nicht mehr.
router.patch('/instances/:uuid/name', ensureCloudUser, async (req, res) => {
    const name = cleanText(req.body && req.body.name, 120);
    if (!name) return cloudError(res, 400, 'invalid_request', 'Invalid instance name');

    try {
        const instance = await requireAccess(req, res);
        if (!instance) return null;
        if (instance.access !== 'owner' && !instance.permissions.rename) {
            return cloudError(res, 403, 'forbidden', 'The host has not allowed you to rename this instance');
        }

        await pool.query('UPDATE cloud_instances SET name = ?, updated_at = NOW() WHERE id = ?', [name, instance.id]);
        return res.json({ ok: true, name, previousName: instance.name });
    } catch (err) {
        console.error('[LuxCloud] PATCH /name failed:', err);
        return cloudError(res, 500, 'server_error', 'Could not rename the instance');
    }
});

module.exports = router;
