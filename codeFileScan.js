// Virenpruefung fuer eigene Dateien in Modpack-Codes (siehe codeFiles.js).
//
// Wer einen Code importiert, startet die Dateien danach im Spiel. Deshalb wird jede Datei
// vor dem Speichern geprueft und regelmaessig erneut, solange ein Code sie braucht:
//
//   1. Eigene Pruefung (immer): Mods und Packs muessen echte ZIP/JAR-Archive sein. Abgelehnt
//      wird, was ausfuehrbare Programme oder Skripte (.exe, .bat, .ps1, ...) mitbringt, die
//      Kennzeichen bekannter Minecraft-Malware (fractureiser/Skyrage, Neko-Stealer) oder
//      Code, der Discord-Tokens bzw. Browser-Passwoerter ausliest. Dazu Schutz vor ZIP-Bomben.
//   2. ClamAV (wenn CLAMAV_HOST gesetzt ist): Datei an clamd (INSTREAM) schicken. Ist ClamAV
//      eingerichtet, aber nicht erreichbar, wird nichts angenommen ("fail closed").
//   3. VirusTotal (wenn VIRUSTOTAL_API_KEY gesetzt ist): nur der SHA-256 wird nachgeschlagen,
//      die Datei selbst verlaesst den Server nicht.
//
// Ergebnis: { status: 'clean' | 'infected' | 'error', engine, reason }

const fs = require('fs');
const net = require('net');
const path = require('path');

const MAX_UNCOMPRESSED_BYTES = Number(process.env.LUX_CODE_SCAN_MAX_UNCOMPRESSED || 1024 * 1024 * 1024);
const MAX_ENTRIES = Number(process.env.LUX_CODE_SCAN_MAX_ENTRIES || 60000);
const MAX_ENTRY_READ_BYTES = 32 * 1024 * 1024;
const CLAMAV_TIMEOUT_MS = Number(process.env.CLAMAV_TIMEOUT_MS || 120000);
const VT_MALICIOUS_THRESHOLD = Number(process.env.VIRUSTOTAL_MALICIOUS_THRESHOLD || 2);

// Dateien, die in einer Mod oder einem Pack nichts zu suchen haben.
const BLOCKED_ENTRY_RE = /\.(exe|scr|com|bat|cmd|ps1|psm1|vbs|vbe|wsf|wsh|hta|msi|msp|lnk|jse|reg|cpl|pif|apk|dmg|pkg|app|command|sh)$/i;

// Kennzeichen bekannter Minecraft-Malware (Pfade, Hosts, Klassen). Alles in Kleinbuchstaben.
const MALWARE_MARKERS = [
    { marker: 'dev/neko/nekoclient', name: 'fractureiser (nekoclient)' },
    { marker: 'dev/neko/nekoinjector', name: 'fractureiser (nekoinjector)' },
    { marker: '85.217.144.130', name: 'fractureiser stage 0 host' },
    { marker: '107.189.3.101', name: 'fractureiser stage 0 host' },
    { marker: 'files-8ie.pages.dev', name: 'fractureiser stage 0 host' },
    { marker: 'skyrage', name: 'Skyrage malware' },
    { marker: 'neko.run', name: 'fractureiser (neko.run)' },
    { marker: 'microsoft-vm-core', name: 'fractureiser persistence' },
    { marker: 'lib.jar.fixed', name: 'fractureiser persistence' }
];

// Token- und Passwort-Diebe lesen bestimmte Dateien von Discord und Browsern. Keine echte
// Mod braucht das. Treffer nur, wenn alle Teile einer Gruppe in derselben Datei stehen.
const STEALER_PATTERNS = [
    { all: ['local storage', 'leveldb', 'discord'], name: 'Discord token stealer' },
    { all: ['login data', 'local state', 'encrypted_key'], name: 'browser password stealer' },
    { all: ['dpapi', 'cryptunprotectdata', 'login data'], name: 'browser password stealer' },
    { all: ['discord.com/api/webhooks', 'accesstoken'], name: 'Minecraft session stealer' },
    { all: ['discordapp.com/api/webhooks', 'accesstoken'], name: 'Minecraft session stealer' }
];

function clean(engine) {
    return { status: 'clean', engine, reason: null };
}

function infected(engine, reason) {
    return { status: 'infected', engine, reason };
}

function scanError(engine, reason) {
    return { status: 'error', engine, reason };
}

function readHead(filePath, length) {
    const fd = fs.openSync(filePath, 'r');
    try {
        const buffer = Buffer.alloc(length);
        const read = fs.readSync(fd, buffer, 0, length, 0);
        return buffer.subarray(0, read);
    } finally {
        fs.closeSync(fd);
    }
}

function isPortableExecutable(buffer) {
    if (buffer.length < 64 || buffer[0] !== 0x4d || buffer[1] !== 0x5a) return false;
    const peOffset = buffer.readUInt32LE(60);
    if (peOffset + 4 > buffer.length) return true;
    return buffer.toString('latin1', peOffset, peOffset + 4) === 'PE\u0000\u0000';
}

function isElf(buffer) {
    return buffer.length >= 4 && buffer[0] === 0x7f && buffer.toString('latin1', 1, 4) === 'ELF';
}

function findMarkers(text) {
    for (const { marker, name } of MALWARE_MARKERS) {
        if (text.includes(marker)) return name;
    }
    for (const { all, name } of STEALER_PATTERNS) {
        if (all.every((part) => text.includes(part))) return name;
    }
    return null;
}

function readEntry(zip, entry) {
    return new Promise((resolve, reject) => {
        zip.openReadStream(entry, (err, stream) => {
            if (err) return reject(err);
            const chunks = [];
            let size = 0;
            stream.on('data', (chunk) => {
                size += chunk.length;
                if (size > MAX_ENTRY_READ_BYTES) {
                    stream.destroy();
                    resolve(Buffer.concat(chunks));
                    return;
                }
                chunks.push(chunk);
            });
            stream.on('end', () => resolve(Buffer.concat(chunks)));
            stream.on('error', reject);
        });
    });
}

function openZip(filePath) {
    const yauzl = require('yauzl');
    return new Promise((resolve, reject) => {
        yauzl.open(filePath, { lazyEntries: true, autoClose: false, strictFileNames: false, validateEntrySizes: true }, (err, zip) => {
            if (err) reject(err);
            else resolve(zip);
        });
    });
}

// Geht das Archiv durch, auch verschachtelte Jars (Jar-in-Jar), bis zu einer Tiefe von 3.
async function scanArchive(filePath, depth = 0, budget = { bytes: 0, entries: 0 }) {
    let zip;
    try {
        zip = await openZip(filePath);
    } catch (err) {
        return infected('lux', 'not a valid mod or pack archive');
    }

    try {
        return await new Promise((resolve, reject) => {
            let finished = false;
            const finish = (result) => {
                if (finished) return;
                finished = true;
                resolve(result);
            };

            zip.on('error', (err) => {
                if (!finished) {
                    finished = true;
                    reject(err);
                }
            });
            zip.on('end', () => finish(clean('lux')));
            zip.on('entry', async (entry) => {
                if (finished) return;
                try {
                    budget.entries += 1;
                    budget.bytes += Number(entry.uncompressedSize) || 0;
                    if (budget.entries > MAX_ENTRIES || budget.bytes > MAX_UNCOMPRESSED_BYTES) {
                        return finish(infected('lux', 'archive unpacks to an unreasonable size (zip bomb)'));
                    }

                    const name = String(entry.fileName || '');
                    if (name.endsWith('/')) return zip.readEntry();

                    const lowerName = name.toLowerCase();
                    if (BLOCKED_ENTRY_RE.test(lowerName)) {
                        return finish(infected('lux', `contains a program or script (${path.posix.basename(name)})`));
                    }
                    const nameMarker = findMarkers(lowerName);
                    if (nameMarker) return finish(infected('lux', nameMarker));

                    const data = await readEntry(zip, entry);
                    if (isPortableExecutable(data) && !/\.(dll|sys|node)$/.test(lowerName)) {
                        return finish(infected('lux', `contains a hidden Windows program (${path.posix.basename(name)})`));
                    }
                    if (isElf(data) && !/\.(so|node)(\.\d+)*$/.test(lowerName) && !/\.so$/.test(lowerName)) {
                        return finish(infected('lux', `contains a hidden Linux program (${path.posix.basename(name)})`));
                    }

                    const marker = findMarkers(data.toString('latin1').toLowerCase());
                    if (marker) return finish(infected('lux', marker));

                    if (depth < 3 && /\.(jar|zip)$/.test(lowerName) && data.length > 4 && data[0] === 0x50 && data[1] === 0x4b) {
                        const nestedPath = `${filePath}.nested-${depth}-${budget.entries}`;
                        fs.writeFileSync(nestedPath, data);
                        try {
                            const nested = await scanArchive(nestedPath, depth + 1, budget);
                            if (nested.status !== 'clean') {
                                return finish({ ...nested, reason: `${path.posix.basename(name)}: ${nested.reason}` });
                            }
                        } finally {
                            fs.rmSync(nestedPath, { force: true });
                        }
                    }
                    return zip.readEntry();
                } catch (err) {
                    return finish(infected('lux', 'archive could not be read completely'));
                }
            });
            zip.readEntry();
        });
    } finally {
        try { zip.close(); } catch (_) { /* ignore */ }
    }
}

async function builtinScan(filePath) {
    const head = readHead(filePath, 4096);
    if (isPortableExecutable(head) || isElf(head)) return infected('lux', 'file is a program, not a mod or pack');
    if (head.length < 4 || head[0] !== 0x50 || head[1] !== 0x4b) return infected('lux', 'not a valid mod or pack archive');
    return scanArchive(filePath);
}

// clamd INSTREAM: "zINSTREAM\0", dann Bloecke <laenge uint32 BE><daten>, Ende mit 0.
function clamavScan(filePath) {
    const host = process.env.CLAMAV_HOST;
    if (!host) return Promise.resolve(null);
    const port = Number(process.env.CLAMAV_PORT || 3310);

    return new Promise((resolve) => {
        let answer = '';
        let settled = false;
        const done = (result) => {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolve(result);
        };

        const socket = net.createConnection({ host, port }, () => {
            socket.write('zINSTREAM\u0000');
            const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
            stream.on('data', (chunk) => {
                const size = Buffer.alloc(4);
                size.writeUInt32BE(chunk.length, 0);
                socket.write(size);
                if (!socket.write(chunk)) {
                    stream.pause();
                    socket.once('drain', () => stream.resume());
                }
            });
            stream.on('end', () => socket.write(Buffer.alloc(4)));
            stream.on('error', (err) => done(scanError('clamav', `could not read the file: ${err.message}`)));
        });
        socket.setTimeout(CLAMAV_TIMEOUT_MS, () => done(scanError('clamav', 'virus scanner did not answer in time')));
        socket.on('data', (chunk) => { answer += chunk.toString('utf8'); });
        socket.on('error', (err) => done(scanError('clamav', `virus scanner not reachable (${err.code || err.message})`)));
        socket.on('close', () => {
            const text = answer.replace(/\u0000/g, '').trim();
            if (/: OK$/.test(text)) return done(clean('clamav'));
            const found = /: (.+) FOUND$/.exec(text);
            if (found) return done(infected('clamav', found[1]));
            return done(scanError('clamav', text ? `virus scanner error: ${text}` : 'virus scanner closed the connection'));
        });
    });
}

async function virusTotalLookup(sha256) {
    const key = process.env.VIRUSTOTAL_API_KEY;
    if (!key || typeof fetch !== 'function') return null;
    try {
        const res = await fetch(`https://www.virustotal.com/api/v3/files/${sha256}`, {
            headers: { 'x-apikey': key },
            signal: AbortSignal.timeout(15000)
        });
        if (res.status === 404) return null;
        if (!res.ok) return null;
        const body = await res.json();
        const stats = body && body.data && body.data.attributes && body.data.attributes.last_analysis_stats;
        const malicious = Number(stats && stats.malicious) || 0;
        if (malicious >= VT_MALICIOUS_THRESHOLD) {
            return infected('virustotal', `${malicious} antivirus engines on VirusTotal flag this file`);
        }
        return clean('virustotal');
    } catch (_) {
        return null;
    }
}

async function scanFile(filePath, { sha256 } = {}) {
    const engines = [];

    const own = await builtinScan(filePath);
    if (own.status !== 'clean') return own;
    engines.push('lux');

    const clam = await clamavScan(filePath);
    if (clam) {
        if (clam.status !== 'clean') return clam;
        engines.push('clamav');
    }

    if (sha256) {
        const vt = await virusTotalLookup(sha256);
        if (vt) {
            if (vt.status !== 'clean') return vt;
            engines.push('virustotal');
        }
    }

    return { status: 'clean', engine: engines.join('+'), reason: null };
}

function scannerSetup() {
    return {
        builtin: true,
        clamav: Boolean(process.env.CLAMAV_HOST),
        virustotal: Boolean(process.env.VIRUSTOTAL_API_KEY)
    };
}

module.exports = { scanFile, scannerSetup, builtinScan, findMarkers };
