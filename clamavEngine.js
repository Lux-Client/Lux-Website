// ClamAV nur bei Bedarf.
//
// clamd haelt alle Virensignaturen im Speicher (gut 1 GB). Dauerhaft laufen lassen waere
// teuer, deshalb startet der Server clamd erst, wenn in der Warteschlange (scanQueue.js)
// etwas liegt, und beendet ihn nach CLAMAV_IDLE_STOP_SECONDS ohne Arbeit wieder. Im
// Leerlauf belegt ClamAV dann gar keinen Speicher.
//
// Modi (CLAMAV_MODE):
//   local  (Standard) clamd/freshclam laufen als Kindprozess im selben Container. Die
//          Signaturen liegen unter DATA_DIR/clamav und werden vor dem Start aufgefrischt,
//          wenn sie aelter als CLAMAV_UPDATE_HOURS sind.
//   remote clamd laeuft woanders (CLAMAV_HOST/CLAMAV_PORT) und wird nicht gesteuert.
//   off    kein ClamAV, nur die eigene Pruefung (fuer Entwicklung).

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { clamdCommand, clamavScan } = require('./codeFileScan');

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const CLAM_DIR = process.env.CLAMAV_DATA_DIR || path.join(DATA_DIR, 'clamav');
const LOCAL_PORT = Number(process.env.CLAMAV_LOCAL_PORT || 3310);
const START_TIMEOUT_MS = Number(process.env.CLAMAV_START_TIMEOUT_SECONDS || 240) * 1000;
const IDLE_STOP_MS = Number(process.env.CLAMAV_IDLE_STOP_SECONDS || 300) * 1000;
const UPDATE_EVERY_MS = Number(process.env.CLAMAV_UPDATE_HOURS || 12) * 60 * 60 * 1000;

function mode() {
    const value = String(process.env.CLAMAV_MODE || '').toLowerCase();
    if (value === 'remote' || value === 'off' || value === 'local') return value;
    return process.env.CLAMAV_HOST ? 'remote' : 'local';
}

function findBinary(name) {
    const candidates = [process.env[`CLAMAV_${name.toUpperCase()}_BIN`], `/usr/sbin/${name}`, `/usr/bin/${name}`, `/usr/local/sbin/${name}`, `/usr/local/bin/${name}`];
    for (const candidate of candidates) {
        if (candidate && fs.existsSync(candidate)) return candidate;
    }
    const which = spawnSync('which', [name], { encoding: 'utf8' });
    return which.status === 0 ? which.stdout.trim() : null;
}

const state = {
    status: 'stopped', // stopped | updating | starting | ready | stopping | error | unavailable | off
    pid: null,
    startedAt: null,
    readyAt: null,
    lastError: null,
    lastErrorAt: null,
    version: null,
    signaturesUpdatedAt: null,
    idleSince: null,
    starts: 0,
    crashes: 0
};

let child = null;
let startPromise = null;
let idleTimer = null;
let busy = 0;
let stopping = false;
const listeners = new Set();

function emit() {
    for (const listener of listeners) {
        try { listener(snapshot()); } catch (_) { /* ignore */ }
    }
}

function setStatus(status, extra = {}) {
    Object.assign(state, extra, { status });
    emit();
}

function fail(message) {
    state.lastError = message;
    state.lastErrorAt = Date.now();
    console.error(`[ClamAV] ${message}`);
}

function target() {
    if (mode() === 'remote') return { host: process.env.CLAMAV_HOST, port: Number(process.env.CLAMAV_PORT || 3310) };
    return { host: '127.0.0.1', port: LOCAL_PORT };
}

function memoryBytes() {
    if (!state.pid) return 0;
    try {
        const status = fs.readFileSync(`/proc/${state.pid}/status`, 'utf8');
        const match = /VmRSS:\s+(\d+)\s+kB/.exec(status);
        return match ? Number(match[1]) * 1024 : 0;
    } catch (_) {
        return 0;
    }
}

function signatureInfo() {
    try {
        const files = fs.readdirSync(CLAM_DIR).filter((name) => /\.(cvd|cld|cud|hdb|hsb|ndb|ldb)$/.test(name));
        if (files.length === 0) return null;
        const newest = Math.max(...files.map((name) => fs.statSync(path.join(CLAM_DIR, name)).mtimeMs));
        return { files: files.length, updatedAt: newest };
    } catch (_) {
        return null;
    }
}

function snapshot() {
    const signatures = mode() === 'local' ? signatureInfo() : null;
    return {
        mode: mode(),
        status: mode() === 'off' ? 'off' : state.status,
        pid: state.pid,
        startedAt: state.startedAt,
        readyAt: state.readyAt,
        lastError: state.lastError,
        lastErrorAt: state.lastErrorAt,
        version: state.version,
        memoryBytes: memoryBytes(),
        signatures,
        idleStopsAt: idleTimer && state.idleSince ? state.idleSince + IDLE_STOP_MS : null,
        idleStopSeconds: IDLE_STOP_MS / 1000,
        starts: state.starts,
        crashes: state.crashes
    };
}

function currentUser() {
    try {
        return require('os').userInfo().username || 'root';
    } catch (_) {
        return 'root';
    }
}

function writeConfigs() {
    fs.mkdirSync(CLAM_DIR, { recursive: true });
    const clamdConf = path.join(CLAM_DIR, 'clamd.conf');
    fs.writeFileSync(clamdConf, [
        `DatabaseDirectory ${CLAM_DIR}`,
        `TCPSocket ${LOCAL_PORT}`,
        'TCPAddr 127.0.0.1',
        'Foreground yes',
        'MaxThreads 2',
        'MaxQueue 10',
        // Beim Signatur-Reload nicht doppelt Speicher belegen.
        'ConcurrentDatabaseReload no',
        'SelfCheck 0',
        'MaxScanSize 400M',
        'MaxFileSize 250M',
        'StreamMaxLength 250M',
        'MaxRecursion 16',
        'MaxFiles 60000',
        'AlertExceedsMax no',
        'LogTime yes',
        ''
    ].join('\n'));
    const freshConf = path.join(CLAM_DIR, 'freshclam.conf');
    fs.writeFileSync(freshConf, [
        `DatabaseDirectory ${CLAM_DIR}`,
        'DatabaseMirror database.clamav.net',
        // freshclam wechselt sonst auf den Nutzer "clamav", der hier nicht schreiben darf.
        `DatabaseOwner ${currentUser()}`,
        'Foreground yes',
        'Checks 0',
        ''
    ].join('\n'));
    return { clamdConf, freshConf };
}

function runFreshclam(freshConf) {
    const binary = findBinary('freshclam');
    if (!binary) return Promise.reject(new Error('freshclam is not installed'));
    return new Promise((resolve, reject) => {
        const proc = spawn(binary, [`--config-file=${freshConf}`, `--datadir=${CLAM_DIR}`, '--stdout'], { stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '';
        proc.stdout.on('data', (chunk) => { output += chunk; });
        proc.stderr.on('data', (chunk) => { output += chunk; });
        proc.on('error', reject);
        proc.on('close', (code) => {
            if (code === 0 || code === 1) resolve(output);
            else reject(new Error(`freshclam exited with ${code}: ${output.trim().split('\n').slice(-2).join(' ')}`));
        });
    });
}

async function updateSignatures({ force = false } = {}) {
    if (mode() !== 'local') return { skipped: true };
    const { freshConf } = writeConfigs();
    const info = signatureInfo();
    if (!force && info && Date.now() - info.updatedAt < UPDATE_EVERY_MS) return { skipped: true };
    const previous = state.status;
    setStatus('updating');
    try {
        await runFreshclam(freshConf);
        state.signaturesUpdatedAt = Date.now();
        return { updated: true };
    } catch (err) {
        fail(`Signature update failed: ${err.message}`);
        // Mit alten Signaturen weiterarbeiten, wenn es welche gibt.
        if (!signatureInfo()) throw err;
        return { updated: false, error: err.message };
    } finally {
        if (state.status === 'updating') setStatus(previous === 'ready' ? 'ready' : 'stopped');
    }
}

async function waitForPing(deadline) {
    while (Date.now() < deadline) {
        if (!child) throw new Error(state.lastError || 'clamd exited during start');
        try {
            const answer = await clamdCommand(target(), 'PING', 3000);
            if (answer === 'PONG') return;
        } catch (_) { /* not up yet */ }
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error('clamd did not become ready in time');
}

async function startLocal() {
    const binary = findBinary('clamd');
    if (!binary) {
        setStatus('unavailable');
        fail('clamd is not installed on this server');
        throw new Error('clamd is not installed on this server');
    }

    await updateSignatures();
    if (!signatureInfo()) throw new Error('no virus signatures available yet');

    const { clamdConf } = writeConfigs();
    setStatus('starting', { startedAt: Date.now(), readyAt: null });
    stopping = false;
    child = spawn(binary, [`--config-file=${clamdConf}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    state.pid = child.pid;
    state.starts += 1;
    let tail = '';
    const keep = (chunk) => { tail = (tail + chunk).slice(-2000); };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    const proc = child;
    child.on('exit', (code, signal) => {
        if (child !== proc) return;
        child = null;
        state.pid = null;
        if (!stopping) {
            state.crashes += 1;
            fail(`clamd stopped unexpectedly (${signal || code}). ${tail.trim().split('\n').slice(-1)[0] || ''}`.trim());
            setStatus('error');
        } else {
            setStatus('stopped', { readyAt: null });
        }
    });

    await waitForPing(Date.now() + START_TIMEOUT_MS);
    try {
        state.version = await clamdCommand(target(), 'VERSION', 3000);
    } catch (_) { /* optional */ }
    setStatus('ready', { readyAt: Date.now() });
}

async function startRemote() {
    setStatus('starting', { startedAt: Date.now() });
    const answer = await clamdCommand(target(), 'PING', 5000).catch((err) => { throw new Error(`clamd at ${target().host} is not reachable (${err.code || err.message})`); });
    if (answer !== 'PONG') throw new Error(`clamd at ${target().host} answered "${answer}"`);
    try {
        state.version = await clamdCommand(target(), 'VERSION', 3000);
    } catch (_) { /* optional */ }
    setStatus('ready', { readyAt: Date.now() });
}

// Sorgt dafuer, dass ClamAV bereit ist. Wirft, wenn das nicht klappt.
async function ensureReady() {
    if (mode() === 'off') return;
    if (state.status === 'ready' && (mode() === 'remote' || child)) return;
    if (!startPromise) {
        startPromise = (mode() === 'remote' ? startRemote() : startLocal())
            .catch(async (err) => {
                fail(err.message);
                if (mode() === 'local') await stop().catch(() => {});
                if (state.status !== 'unavailable') setStatus('error');
                throw err;
            })
            .finally(() => { startPromise = null; });
    }
    return startPromise;
}

function cancelIdle() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
    state.idleSince = null;
}

function scheduleIdleStop() {
    cancelIdle();
    if (mode() !== 'local' || !child) return;
    state.idleSince = Date.now();
    idleTimer = setTimeout(() => {
        idleTimer = null;
        state.idleSince = null;
        if (busy === 0) {
            console.log('[ClamAV] Queue empty, stopping clamd to free memory.');
            stop().catch(() => {});
        }
    }, IDLE_STOP_MS);
    if (idleTimer.unref) idleTimer.unref();
    emit();
}

async function stop() {
    cancelIdle();
    if (mode() !== 'local') {
        if (mode() === 'remote') setStatus('stopped', { readyAt: null });
        return;
    }
    const proc = child;
    if (!proc) {
        if (state.status !== 'unavailable') setStatus('stopped', { readyAt: null });
        return;
    }
    stopping = true;
    setStatus('stopping');
    await new Promise((resolve) => {
        const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch (_) { /* ignore */ } }, 10000);
        proc.once('exit', () => { clearTimeout(timer); resolve(); });
        try { proc.kill('SIGTERM'); } catch (_) { resolve(); }
    });
}

// Eine Datei pruefen. Liefert { status: 'clean'|'infected'|'error', engine, reason }.
async function scan(filePath) {
    if (mode() === 'off') return { status: 'clean', engine: 'lux', reason: null };
    cancelIdle();
    busy += 1;
    try {
        await ensureReady();
        const result = await clamavScan(filePath, target());
        if (result && result.status === 'error' && mode() === 'local' && !child) {
            setStatus('error');
        }
        return result || { status: 'error', engine: 'clamav', reason: 'no answer' };
    } catch (err) {
        return { status: 'error', engine: 'clamav', reason: err.message };
    } finally {
        busy -= 1;
    }
}

// clamd nicht verwaist zuruecklassen, wenn der Server endet.
process.once('exit', () => {
    if (child) {
        try { child.kill('SIGKILL'); } catch (_) { /* ignore */ }
    }
});

function onChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

module.exports = {
    CLAM_DIR,
    ensureReady,
    mode,
    onChange,
    scan,
    scheduleIdleStop,
    snapshot,
    stop,
    updateSignatures
};
