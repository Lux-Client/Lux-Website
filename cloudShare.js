// Zusammenarbeit an einer Cloud-Instanz.
//
// Der Eigentuemer (cloud_instances.user_id) bleibt der Host: ihm gehoert die Instanz, er
// zahlt den Speicher und legt pro Mitglied fest, was es darf (PERMISSIONS unten).
// Mitglieder (cloud_instance_members) arbeiten am gemeinsamen Inhalt mit -- Mods,
// Resource Packs, Shader und deren Configs.
// Alles andere (Welten, options.txt mit den Tastenbelegungen, servers.dat, Screenshots,
// Mod-Daten wie Wegpunkte) ist privat: ein Mitglied bekommt es weder zu sehen noch kann
// es daran etwas aendern. Die Grenze wird hier auf dem Server gezogen, nicht im Client.

const pool = require('./database');
const { INSTANCE_COLUMNS, decorate, serializeInstance } = require('./cloudInstances');

const MAX_MEMBERS = Number(process.env.LUXCLOUD_MAX_MEMBERS || 10);

// Was Mitglieder aendern duerfen (erstes Pfadsegment).
const SHARED_WRITABLE_DIRS = new Set(['mods', 'resourcepacks', 'shaderpacks', 'config', 'defaultconfigs']);

// Was Mitglieder zusaetzlich nur lesen: ohne Version und Loader aus instance.json liesse
// sich die Instanz auf ihrem PC gar nicht starten.
const SHARED_READONLY_FILES = new Set(['instance.json']);
const SHARED_READONLY_PREFIX = 'instance-icon.';

// Was der Host pro Mitglied erlauben kann. Schluessel = Name in der API, column = Spalte
// in cloud_instance_members, fallback = Standard fuer neu eingeladene Mitglieder.
const PERMISSIONS = {
    addContent: { column: 'can_add_content', fallback: true },
    removeContent: { column: 'can_remove_content', fallback: false },
    editConfig: { column: 'can_edit_config', fallback: true },
    rename: { column: 'can_rename', fallback: false },
    manageMembers: { column: 'can_manage_members', fallback: false }
};
const PERMISSION_COLUMNS = Object.values(PERMISSIONS).map((entry) => `m.${entry.column}`).join(', ');

const CONTENT_DIRS = new Set(['mods', 'resourcepacks', 'shaderpacks']);

function ownerPermissions() {
    return Object.fromEntries(Object.keys(PERMISSIONS).map((key) => [key, true]));
}

function defaultPermissions() {
    return Object.fromEntries(Object.entries(PERMISSIONS).map(([key, entry]) => [key, entry.fallback]));
}

function permissionsFromRow(row) {
    return Object.fromEntries(Object.entries(PERMISSIONS).map(([key, entry]) => [
        key,
        row && row[entry.column] !== undefined && row[entry.column] !== null ? Boolean(row[entry.column]) : entry.fallback
    ]));
}

// Nimmt nur bekannte Schluessel mit echten booleschen Werten an.
function parsePermissionPatch(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const patch = {};
    for (const [key, entry] of Object.entries(value)) {
        if (!(key in PERMISSIONS)) return null;
        if (typeof entry !== 'boolean') return null;
        patch[key] = entry;
    }
    return Object.keys(patch).length > 0 ? patch : null;
}

function topLevel(relPath) {
    return String(relPath || '').split('/')[0].toLowerCase();
}

function isMemberWritable(relPath) {
    const segments = String(relPath || '').split('/');
    return segments.length > 1 && SHARED_WRITABLE_DIRS.has(topLevel(relPath));
}

function isMemberReadable(relPath) {
    if (isMemberWritable(relPath)) return true;
    const value = String(relPath || '');
    if (value.includes('/')) return false;
    const lower = value.toLowerCase();
    return SHARED_READONLY_FILES.has(lower) || lower.startsWith(SHARED_READONLY_PREFIX);
}

// Liefert die Instanz, wenn der Nutzer Eigentuemer oder Mitglied ist, samt `access`
// ('owner' | 'member') und `owner_id`. Eigene Instanzen gewinnen, falls ein Konto
// (theoretisch) unter derselben UUID beides waere.
async function accessibleInstance(userId, instanceUuid, { status = 'active', executor = pool } = {}) {
    const statusSql = status === 'any' ? '' : ' AND i.status = ?';
    const statusParams = status === 'any' ? [] : [status];

    const [owned] = await executor.query(
        `SELECT ${INSTANCE_COLUMNS}, i.user_id FROM cloud_instances i
          WHERE i.user_id = ? AND i.instance_uuid = ?${statusSql}`,
        [userId, String(instanceUuid), ...statusParams]
    );
    if (owned.length > 0) {
        const [row] = await decorate(owned, executor);
        return { ...row, access: 'owner', owner_id: Number(owned[0].user_id), permissions: ownerPermissions() };
    }

    const [shared] = await executor.query(
        `SELECT ${INSTANCE_COLUMNS}, i.user_id, ${PERMISSION_COLUMNS} FROM cloud_instances i
           JOIN cloud_instance_members m ON m.instance_id = i.id AND m.user_id = ?
          WHERE i.instance_uuid = ?${statusSql}
          ORDER BY i.id`,
        [userId, String(instanceUuid), ...statusParams]
    );
    if (shared.length === 0) return null;

    const [row] = await decorate(shared.slice(0, 1), executor);
    return {
        ...row,
        access: 'member',
        owner_id: Number(shared[0].user_id),
        permissions: permissionsFromRow(shared[0])
    };
}

async function isMember(instanceId, userId, executor = pool) {
    const [rows] = await executor.query(
        'SELECT 1 AS ok FROM cloud_instance_members WHERE instance_id = ? AND user_id = ?',
        [instanceId, userId]
    );
    return rows.length > 0;
}

async function hasMembers(instanceId, executor = pool) {
    const [rows] = await executor.query(
        'SELECT COUNT(*) AS count FROM cloud_instance_members WHERE instance_id = ?',
        [instanceId]
    );
    return Number(rows[0] ? rows[0].count : 0) > 0;
}

// Die Sicht eines Mitglieds auf ein Manifest.
function filterManifestForMember(manifest) {
    const entries = Array.isArray(manifest && manifest.entries) ? manifest.entries : [];
    return {
        ...manifest,
        entries: entries.filter((entry) => isMemberReadable(entry.path))
    };
}

// Der Commit eines Mitglieds: seine Aenderungen am gemeinsamen Teil, alles andere bleibt
// exakt so, wie der Host es zuletzt hochgeladen hat. Name, Laufzeit und Icon kommen
// ebenfalls vom Host -- ein Mitglied kann die Instanz nicht umbenennen oder den Loader
// tauschen.
function mergeMemberManifest(parentManifest, memberManifest) {
    const parentEntries = Array.isArray(parentManifest && parentManifest.entries) ? parentManifest.entries : [];
    const memberEntries = Array.isArray(memberManifest && memberManifest.entries) ? memberManifest.entries : [];

    const kept = parentEntries.filter((entry) => !isMemberWritable(entry.path));
    const contributed = memberEntries.filter((entry) => isMemberWritable(entry.path));
    const entries = [...kept, ...contributed].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

    const base = parentManifest || memberManifest || {};
    const merged = {
        ...memberManifest,
        manifestVersion: base.manifestVersion !== undefined ? base.manifestVersion : memberManifest.manifestVersion,
        instanceId: base.instanceId !== undefined ? base.instanceId : memberManifest.instanceId,
        name: base.name !== undefined ? base.name : memberManifest.name,
        entries
    };
    for (const key of ['runtime', 'icon', 'settings']) {
        if (parentManifest && key in parentManifest) merged[key] = parentManifest[key];
        else if (parentManifest) delete merged[key];
    }

    return { manifest: merged, contributed };
}

// Welche Aenderungen eines Mitglieds seine Rechte ueberschreiten. Verglichen wird der
// gemeinsame Teil seines Manifests mit dem letzten Stand in der Cloud.
function permissionViolations(parentManifest, memberManifest, permissions) {
    const before = new Map();
    const beforeEntries = new Map();
    for (const entry of (parentManifest && parentManifest.entries) || []) {
        if (isMemberWritable(entry.path)) {
            before.set(entry.path, entry.sha256);
            beforeEntries.set(entry.path, entry);
        }
    }
    const after = new Map();
    const afterEntries = new Map();
    for (const entry of (memberManifest && memberManifest.entries) || []) {
        if (isMemberWritable(entry.path)) {
            after.set(entry.path, entry.sha256);
            afterEntries.set(entry.path, entry);
        }
    }

    // Eine Mod aktualisieren oder abschalten heisst: die alte Datei verschwindet, eine
    // neue kommt dazu. Das ist eine Aenderung, kein Loeschen -- erkannt am gleichen
    // Inhalt (umbenannt, etwa zu .disabled) oder am gleichen Modrinth-Projekt (neue
    // Version) im selben Ordner.
    const identity = (relPath, entry) => [
        entry.sha256 ? `sha:${entry.sha256}` : null,
        entry.source && entry.source.projectId ? `project:${topLevel(relPath)}:${entry.source.projectId}` : null
    ].filter(Boolean);
    const removedByIdentity = new Map();
    for (const [relPath, entry] of beforeEntries.entries()) {
        if (after.has(relPath)) continue;
        for (const key of identity(relPath, entry)) {
            if (!removedByIdentity.has(key)) removedByIdentity.set(key, []);
            removedByIdentity.get(key).push(relPath);
        }
    }
    const replaced = new Set();
    for (const [relPath, entry] of afterEntries.entries()) {
        if (before.has(relPath)) continue;
        for (const key of identity(relPath, entry)) {
            const candidates = (removedByIdentity.get(key) || []).filter((path) => !replaced.has(path));
            if (candidates.length > 0) {
                replaced.add(candidates[0]);
                break;
            }
        }
    }

    const violations = { addContent: [], removeContent: [], editConfig: [] };
    const note = (relPath, kind) => {
        const isContent = CONTENT_DIRS.has(topLevel(relPath));
        if (!isContent) {
            if (!permissions.editConfig) violations.editConfig.push(relPath);
            return;
        }
        if (kind === 'removed' && !permissions.removeContent) violations.removeContent.push(relPath);
        if (kind !== 'removed' && !permissions.addContent) violations.addContent.push(relPath);
    };

    for (const [relPath, sha] of after.entries()) {
        if (!before.has(relPath)) note(relPath, 'added');
        else if (before.get(relPath) !== sha) note(relPath, 'changed');
    }
    for (const relPath of before.keys()) {
        if (!after.has(relPath)) note(relPath, replaced.has(relPath) ? 'changed' : 'removed');
    }

    const denied = Object.entries(violations).filter(([, paths]) => paths.length > 0);
    return denied.length > 0 ? Object.fromEntries(denied) : null;
}

function blobsOfEntries(entries) {
    const hashes = new Set();
    for (const entry of entries) {
        if (typeof entry.blob === 'string') hashes.add(entry.blob);
        if (entry.chunks && typeof entry.chunks.list === 'string') hashes.add(entry.chunks.list);
    }
    return [...hashes];
}

function fingerprint(entry) {
    return [
        entry.sha256 || null,
        entry.blob || null,
        entry.source ? `${entry.source.projectId}:${entry.source.versionId}` : null
    ].join('|');
}

// Haelt fest, wer eine gemeinsame Datei hinzugefuegt oder geaendert hat. Nur der
// gemeinsame Teil zaehlt -- wer seine eigene Welt spielt, "schreibt" keine Mod.
async function recordAuthors({ instanceId, parentManifest, manifest, userId, revision, executor = pool }) {
    const before = new Map();
    for (const entry of (parentManifest && parentManifest.entries) || []) {
        if (isMemberWritable(entry.path)) before.set(entry.path, fingerprint(entry));
    }
    const after = new Map();
    for (const entry of (manifest && manifest.entries) || []) {
        if (isMemberWritable(entry.path)) after.set(entry.path, fingerprint(entry));
    }

    const touched = [];
    for (const [relPath, print] of after.entries()) {
        if (before.get(relPath) !== print) touched.push(relPath);
    }
    const removed = [...before.keys()].filter((relPath) => !after.has(relPath));

    for (const relPath of touched) {
        await executor.query(
            `INSERT INTO cloud_entry_authors (instance_id, path, user_id, revision, updated_at)
             VALUES (?, ?, ?, ?, NOW())
             ON CONFLICT (instance_id, path) DO UPDATE
                SET user_id = EXCLUDED.user_id, revision = EXCLUDED.revision, updated_at = NOW()
             RETURNING path`,
            [instanceId, relPath, userId, revision]
        );
    }
    for (let i = 0; i < removed.length; i += 500) {
        const batch = removed.slice(i, i + 500);
        await executor.query(
            `DELETE FROM cloud_entry_authors WHERE instance_id = ? AND path IN (${batch.map(() => '?').join(', ')})`,
            [instanceId, ...batch]
        );
    }

    return { touched: touched.length, removed: removed.length };
}

// Wie eine Instanz fuer den jeweiligen Betrachter aussieht. Ein Mitglied sieht weder den
// Hash des vollstaendigen Manifests noch die Groesse samt privater Dateien des Hosts.
function serializeForViewer(row, extra = {}) {
    const base = serializeInstance(row);
    const access = row.access || 'owner';
    if (access === 'member') {
        base.manifestHash = null;
        base.logicalBytes = null;
        base.syncWorlds = false;
        base.syncScreenshots = false;
    }
    return { ...base, access, ...extra };
}

// Ob ein Blob das Manifest irgendeiner Revision ist. Solche Blobs duerfen nie per Hash
// beansprucht werden (siehe claimForeignBlobs in routes/cloudSync.js).
async function isManifestBlob(hash, executor = pool) {
    const [rows] = await executor.query(
        'SELECT 1 AS ok FROM cloud_revisions WHERE manifest_blob = ? LIMIT 1',
        [hash]
    );
    return rows.length > 0;
}

module.exports = {
    MAX_MEMBERS,
    PERMISSIONS,
    defaultPermissions,
    ownerPermissions,
    parsePermissionPatch,
    permissionViolations,
    permissionsFromRow,
    isManifestBlob,
    serializeForViewer,
    SHARED_WRITABLE_DIRS,
    accessibleInstance,
    blobsOfEntries,
    filterManifestForMember,
    hasMembers,
    isMember,
    isMemberReadable,
    isMemberWritable,
    mergeMemberManifest,
    recordAuthors
};
