const { Pool } = require('pg');
require('dotenv').config();

function cleanEnv(value) {
    if (value === undefined || value === null) return value;
    const trimmed = String(value).trim();
    return trimmed.replace(/^['\"](.*)['\"]$/, '$1');
}

function resolveSsl() {
    const fromDbSsl = process.env.DB_SSL;
    if (typeof fromDbSsl !== 'undefined') {
        return String(fromDbSsl).toLowerCase() === 'true'
            ? { rejectUnauthorized: false }
            : false;
    }

    if (process.env.DATABASE_URL) {
        try {
            const sslMode = new URL(cleanEnv(process.env.DATABASE_URL)).searchParams.get('sslmode');
            if (sslMode && ['require', 'verify-ca', 'verify-full'].includes(String(sslMode).toLowerCase())) {
                return { rejectUnauthorized: false };
            }
        } catch {
            // Ignore malformed URL here; pg will report the real connection error.
        }
    }

    return false;
}

const rawPool = new Pool(process.env.DATABASE_URL
    ? {
        connectionString: cleanEnv(process.env.DATABASE_URL),
        max: Number(process.env.DB_POOL_MAX || 10),
        ssl: resolveSsl()
    }
    : {
        host: cleanEnv(process.env.DB_HOST) || '127.0.0.1',
        port: Number(process.env.DB_PORT || 5432),
        user: cleanEnv(process.env.DB_USER) || 'postgres',
        password: cleanEnv(process.env.DB_PASSWORD) || '',
        database: cleanEnv(process.env.DB_NAME) || 'lux',
        max: Number(process.env.DB_POOL_MAX || 10),
        ssl: resolveSsl()
    });

function normalizeSql(sql) {
    let out = String(sql || '');
    out = out.replace(/`/g, '"');
    // Existing code uses double-quoted string literals (MySQL style) in some queries.
    out = out.replace(/"([^"]*)"/g, "'$1'");
    return out;
}

function convertPlaceholders(sql) {
    let idx = 0;
    return sql.replace(/\?/g, () => `$${++idx}`);
}

function prepareSql(sql) {
    let text = convertPlaceholders(normalizeSql(sql));
    if (/^\s*INSERT\b/i.test(text) && !/\bRETURNING\b/i.test(text)) {
        text += ' RETURNING id';
    }
    return text;
}

function mapPgError(err) {
    if (!err) return err;
    if (err.code === '23505') err.code = 'ER_DUP_ENTRY';
    if (err.code === '42701') err.code = 'ER_DUP_FIELDNAME';
    return err;
}

async function runQuery(executor, sql, params = []) {
    const text = prepareSql(sql);
    try {
        const result = await executor.query(text, params);
        if (/^\s*(SELECT|WITH)\b/i.test(text)) {
            return [result.rows];
        }
        return [{
            affectedRows: result.rowCount,
            insertId: result.rows && result.rows[0] ? result.rows[0].id : null,
            rows: result.rows || []
        }];
    } catch (err) {
        throw mapPgError(err);
    }
}

const pool = {
    raw: rawPool,
    query(sql, params = []) {
        return runQuery(rawPool, sql, params);
    },
    async getConnection() {
        const client = await rawPool.connect();
        return {
            query(sql, params = []) {
                return runQuery(client, sql, params);
            },
            beginTransaction() {
                return client.query('BEGIN');
            },
            commit() {
                return client.query('COMMIT');
            },
            rollback() {
                return client.query('ROLLBACK');
            },
            release() {
                client.release();
            }
        };
    },
    async end() {
        await rawPool.end();
    }
};

(async () => {
    try {
        const conn = await rawPool.connect();
        await conn.query('SELECT 1');
        conn.release();
        console.log('[Database] Connected to PostgreSQL successfully!');
    } catch (err) {
        console.error('[Database] CRITICAL: Error connecting to PostgreSQL!');
        console.error('[Database] Check DATABASE_URL (preferred) or DB_* environment variables and PostgreSQL availability.');
        console.error('[Database] Error Details:', err.message);
    }
})();

module.exports = pool;
