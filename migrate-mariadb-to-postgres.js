require('dotenv').config();

const mysql = require('mysql2/promise');
const { Pool } = require('pg');
const { createTables } = require('./db_init');

function cleanEnv(value) {
    if (value === undefined || value === null) return value;
    const trimmed = String(value).trim();
    return trimmed.replace(/^['\"](.*)['\"]$/, '$1');
}

const sourceConfig = {
    host: cleanEnv(process.env.MARIADB_HOST),
    port: Number(process.env.MARIADB_PORT || 3306),
    user: cleanEnv(process.env.MARIADB_USER),
    password: cleanEnv(process.env.MARIADB_PASSWORD),
    database: cleanEnv(process.env.MARIADB_NAME)
};

function resolvePgSsl() {
    const fromDbSsl = process.env.DB_SSL;
    if (typeof fromDbSsl !== 'undefined') {
        return String(fromDbSsl).toLowerCase() === 'true'
            ? { rejectUnauthorized: false }
            : false;
    }

    if (process.env.DATABASE_URL) {
        try {
            const sslMode = new URL(process.env.DATABASE_URL).searchParams.get('sslmode');
            if (sslMode && ['require', 'verify-ca', 'verify-full'].includes(String(sslMode).toLowerCase())) {
                return { rejectUnauthorized: false };
            }
        } catch {
            // Ignore malformed URL here; pg will report a concrete connection error later.
        }
    }

    return false;
}

const targetConfig = process.env.DATABASE_URL
    ? {
        connectionString: cleanEnv(process.env.DATABASE_URL),
        ssl: resolvePgSsl()
    }
    : {
        host: cleanEnv(process.env.DB_HOST) || '127.0.0.1',
        port: Number(process.env.DB_PORT || 5432),
        user: cleanEnv(process.env.DB_USER) || 'postgres',
        password: cleanEnv(process.env.DB_PASSWORD) || '',
        database: cleanEnv(process.env.DB_NAME) || 'lux',
        ssl: resolvePgSsl()
    };

function requireVar(value, name) {
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
}

function toBool(value) {
    if (value === null || value === undefined) return false;
    return value === true || value === 1 || value === '1';
}

async function hasMariaColumn(connection, table, column) {
    const [rows] = await connection.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [column]);
    return rows.length > 0;
}

async function migrateUsers(maria, pg) {
    const [rows] = await maria.query('SELECT * FROM users ORDER BY id');
    for (const row of rows) {
        await pg.query(
            `INSERT INTO users
            (id, google_id, username, email, avatar, bio, role, last_login, ip_address, banned, ban_reason, ban_expires, warn_count, created_at, is_private)
            VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            ON CONFLICT (id) DO UPDATE SET
              google_id = EXCLUDED.google_id,
              username = EXCLUDED.username,
              email = EXCLUDED.email,
              avatar = EXCLUDED.avatar,
              bio = EXCLUDED.bio,
              role = EXCLUDED.role,
              last_login = EXCLUDED.last_login,
              ip_address = EXCLUDED.ip_address,
              banned = EXCLUDED.banned,
              ban_reason = EXCLUDED.ban_reason,
              ban_expires = EXCLUDED.ban_expires,
              warn_count = EXCLUDED.warn_count,
              created_at = EXCLUDED.created_at,
              is_private = EXCLUDED.is_private`,
            [
                row.id,
                row.google_id,
                row.username,
                row.email,
                row.avatar,
                row.bio,
                row.role || 'user',
                row.last_login,
                row.ip_address,
                toBool(row.banned),
                row.ban_reason,
                row.ban_expires,
                Number(row.warn_count || 0),
                row.created_at,
                toBool(row.is_private)
            ]
        );
    }
    console.log(`[Migrator] users migrated: ${rows.length}`);
}

async function migrateExtensions(maria, pg) {
    const hasFilePath = await hasMariaColumn(maria, 'extensions', 'file_path');
    const selectSql = hasFilePath
        ? 'SELECT * FROM extensions ORDER BY id'
        : 'SELECT *, NULL AS file_path FROM extensions ORDER BY id';
    const [rows] = await maria.query(selectSql);

    for (const row of rows) {
        await pg.query(
            `INSERT INTO extensions
            (id, user_id, name, identifier, summary, description, type, visibility, file_path, banner_path, status, downloads, created_at, updated_at)
            VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            ON CONFLICT (id) DO UPDATE SET
              user_id = EXCLUDED.user_id,
              name = EXCLUDED.name,
              identifier = EXCLUDED.identifier,
              summary = EXCLUDED.summary,
              description = EXCLUDED.description,
              type = EXCLUDED.type,
              visibility = EXCLUDED.visibility,
              file_path = EXCLUDED.file_path,
              banner_path = EXCLUDED.banner_path,
              status = EXCLUDED.status,
              downloads = EXCLUDED.downloads,
              created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at`,
            [
                row.id,
                row.user_id,
                row.name,
                row.identifier,
                row.summary,
                row.description,
                row.type || 'extension',
                row.visibility || 'public',
                row.file_path,
                row.banner_path,
                row.status || 'pending',
                Number(row.downloads || 0),
                row.created_at,
                row.updated_at || row.created_at
            ]
        );
    }
    console.log(`[Migrator] extensions migrated: ${rows.length}`);
}

async function migrateExtensionVersions(maria, pg) {
    const [rows] = await maria.query('SELECT * FROM extension_versions ORDER BY id');
    for (const row of rows) {
        await pg.query(
            `INSERT INTO extension_versions
            (id, extension_id, version, changelog, file_path, downloads, status, created_at)
            VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (id) DO UPDATE SET
              extension_id = EXCLUDED.extension_id,
              version = EXCLUDED.version,
              changelog = EXCLUDED.changelog,
              file_path = EXCLUDED.file_path,
              downloads = EXCLUDED.downloads,
              status = EXCLUDED.status,
              created_at = EXCLUDED.created_at`,
            [
                row.id,
                row.extension_id,
                row.version,
                row.changelog,
                row.file_path,
                Number(row.downloads || 0),
                row.status || 'pending',
                row.created_at
            ]
        );
    }
    console.log(`[Migrator] extension_versions migrated: ${rows.length}`);
}

async function migrateExtensionDrafts(maria, pg) {
    const [rows] = await maria.query('SELECT * FROM extension_metadata_drafts ORDER BY id');
    for (const row of rows) {
        await pg.query(
            `INSERT INTO extension_metadata_drafts
            (id, extension_id, name, summary, description, banner_path, status, created_at)
            VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (id) DO UPDATE SET
              extension_id = EXCLUDED.extension_id,
              name = EXCLUDED.name,
              summary = EXCLUDED.summary,
              description = EXCLUDED.description,
              banner_path = EXCLUDED.banner_path,
              status = EXCLUDED.status,
              created_at = EXCLUDED.created_at`,
            [
                row.id,
                row.extension_id,
                row.name,
                row.summary,
                row.description,
                row.banner_path,
                row.status || 'pending',
                row.created_at
            ]
        );
    }
    console.log(`[Migrator] extension_metadata_drafts migrated: ${rows.length}`);
}

async function migrateNotifications(maria, pg) {
    const [rows] = await maria.query('SELECT * FROM notifications ORDER BY id');
    for (const row of rows) {
        await pg.query(
            `INSERT INTO notifications
            (id, user_id, message, type, is_read, created_at)
            VALUES
            ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (id) DO UPDATE SET
              user_id = EXCLUDED.user_id,
              message = EXCLUDED.message,
              type = EXCLUDED.type,
              is_read = EXCLUDED.is_read,
              created_at = EXCLUDED.created_at`,
            [
                row.id,
                row.user_id,
                row.message,
                row.type || 'info',
                toBool(row.is_read),
                row.created_at
            ]
        );
    }
    console.log(`[Migrator] notifications migrated: ${rows.length}`);
}

async function migrateModpackCodes(maria, pg) {
    const [rows] = await maria.query('SELECT * FROM modpack_codes ORDER BY id');
    for (const row of rows) {
        await pg.query(
            `INSERT INTO modpack_codes
            (id, code, owner_uuid, owner_ip, created_at)
            VALUES
            ($1, $2, $3, $4, $5)
            ON CONFLICT (id) DO UPDATE SET
              code = EXCLUDED.code,
              owner_uuid = EXCLUDED.owner_uuid,
              owner_ip = EXCLUDED.owner_ip,
              created_at = EXCLUDED.created_at`,
            [row.id, row.code, row.owner_uuid, row.owner_ip, row.created_at]
        );
    }
    console.log(`[Migrator] modpack_codes migrated: ${rows.length}`);
}

async function resetSequences(pg) {
    const tables = [
        'users',
        'extensions',
        'extension_versions',
        'extension_metadata_drafts',
        'notifications',
        'modpack_codes'
    ];

    for (const table of tables) {
        await pg.query(
            `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1, false)`
        );
    }
    console.log('[Migrator] Sequences reset.');
}

async function main() {
    if (process.env.MARIADB_URL) {
        const sourceFromUrl = new URL(cleanEnv(process.env.MARIADB_URL));
        sourceConfig.host = sourceFromUrl.hostname;
        sourceConfig.port = Number(sourceFromUrl.port || 3306);
        sourceConfig.user = decodeURIComponent(sourceFromUrl.username || '');
        sourceConfig.password = decodeURIComponent(sourceFromUrl.password || '');
        sourceConfig.database = sourceFromUrl.pathname.replace(/^\//, '');
    }

    requireVar(sourceConfig.host, 'MARIADB_HOST or MARIADB_URL');
    requireVar(sourceConfig.user, 'MARIADB_USER or MARIADB_URL');
    requireVar(sourceConfig.database, 'MARIADB_NAME or MARIADB_URL');
    if (!process.env.DATABASE_URL) {
        requireVar(targetConfig.host, 'DB_HOST or DATABASE_URL');
        requireVar(targetConfig.user, 'DB_USER or DATABASE_URL');
        requireVar(targetConfig.database, 'DB_NAME or DATABASE_URL');
    }

    const maria = await mysql.createConnection(sourceConfig);
    const pg = new Pool(targetConfig);
    const pgClient = await pg.connect();

    try {
        console.log('[Migrator] Ensuring PostgreSQL schema exists...');
        const ok = await createTables();
        if (!ok) {
            throw new Error('PostgreSQL schema initialization failed');
        }

        console.log('[Migrator] Starting migration transaction...');
        await pgClient.query('BEGIN');

        await migrateUsers(maria, pgClient);
        await migrateExtensions(maria, pgClient);
        await migrateExtensionVersions(maria, pgClient);
        await migrateExtensionDrafts(maria, pgClient);
        await migrateNotifications(maria, pgClient);
        await migrateModpackCodes(maria, pgClient);
        await resetSequences(pgClient);

        await pgClient.query('COMMIT');
        console.log('[Migrator] MariaDB -> PostgreSQL migration completed successfully.');
    } catch (err) {
        await pgClient.query('ROLLBACK');
        console.error('[Migrator] Migration failed:', err.message);
        process.exitCode = 1;
    } finally {
        await maria.end();
        pgClient.release();
        await pg.end();
    }
}

main();
