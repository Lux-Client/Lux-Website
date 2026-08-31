const { validRelPath, validateManifest, MANIFEST_VERSION } = require('../routes/manifestSchema');

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
    if (condition) {
        passed += 1;
        console.log(`  PASS  ${name}`);
    } else {
        failed += 1;
        console.log(`  FAIL  ${name}${detail !== undefined ? `  -> ${JSON.stringify(detail)}` : ''}`);
    }
}

function section(title) {
    console.log(`\n${title}`);
}

const NUL = String.fromCharCode(0);
const BACKSLASH = String.fromCharCode(92);
const COMBINING_ACUTE = String.fromCharCode(0x301);

const ACCEPTED = [
    'instance.json',
    'mods/sodium-fabric-0.6.13.jar',
    'config/sodium/options.json',
    'saves/Skyblock/region/r.0.0.mca',
    'mods/normal name.jar',
    'mods/Umlaut-Datei.jar',
    'XaeroWaypoints_Backup/waypoints.txt',
    'a/b/c/d/e/f/g/h/i/j/k.txt'
];

const REJECTED = [
    ['leerer Pfad', ''],
    ['nur Punkte', '..'],
    ['Traversal', '../../.ssh/id_rsa'],
    ['Traversal in der Mitte', 'mods/../../etc/passwd'],
    ['fuehrender Slash', '/etc/passwd'],
    ['Windows-Laufwerk', 'C:/Windows/system32'],
    ['Windows-Laufwerk klein', 'c:/windows'],
    ['Backslash', `mods${BACKSLASH}evil.jar`],
    ['UNC-Pfad', `${BACKSLASH}${BACKSLASH}server/share`],
    ['NUL-Byte', `mods/evil${NUL}.jar`],
    ['Steuerzeichen', `mods/evil${String.fromCharCode(1)}.jar`],
    ['reservierter Name CON', 'CON'],
    ['reservierter Name mit Endung', 'con.txt'],
    ['reservierter Name im Ordner', 'aux/foo.json'],
    ['reservierter Name COM1', 'mods/com1.jar'],
    ['abschliessender Punkt', 'mods/trailing.'],
    ['abschliessendes Leerzeichen', 'mods/trailing '],
    ['Einzelpunkt-Segment', 'mods/./sodium.jar'],
    ['leeres Segment', 'mods//sodium.jar'],
    ['zu tief', `${'a/'.repeat(30)}b`],
    ['zu lang', 'x'.repeat(401)],
    ['Segment zu lang', `mods/${'x'.repeat(121)}`],
    ['Doppelpunkt im Namen', 'mods/a:b.jar'],
    ['Sternchen', 'mods/*.jar'],
    ['Fragezeichen', 'mods/a?.jar'],
    ['Pipe', 'mods/a|b.jar'],
    ['nicht normalisiertes Unicode', `mods/e${COMBINING_ACUTE}vil.jar`]
];

function baseEntry(overrides = {}) {
    return {
        path: 'config/options.json',
        size: 4096,
        mtime: 1756582000000,
        sha256: 'a'.repeat(64),
        blob: 'a'.repeat(64),
        ...overrides
    };
}

function baseManifest(overrides = {}) {
    return {
        manifestVersion: MANIFEST_VERSION,
        instanceId: 'inst-skyblock-1',
        name: 'Skyblock',
        parentRevision: 11,
        createdAt: 1756582980000,
        device: { uuid: 'dev-aaaa-0001', platform: 'win32', appVersion: '1.11.0' },
        runtime: { mcVersion: '1.21.1', loader: 'fabric', loaderVersion: '0.16.5' },
        settings: { syncWorlds: false, crossPlatform: true },
        entries: [baseEntry()],
        ...overrides
    };
}

section('1) Pfadvalidierung — was durchgehen muss');
for (const good of ACCEPTED) {
    check(`akzeptiert ${JSON.stringify(good)}`, validRelPath(good) === true);
}

section('2) Pfadvalidierung — Angriffsvektoren');
for (const [label, bad] of REJECTED) {
    check(`weist ab: ${label}`, validRelPath(bad) === false, bad);
}

check('weist Nicht-Strings ab', validRelPath(null) === false && validRelPath(42) === false);

section('3) Manifest-Grundgeruest');

let result = validateManifest(baseManifest());
check('gueltiges Manifest -> valid', result.valid === true, result.issues);
check('Statistik zaehlt Eintraege und Bytes',
    result.stats.entryCount === 1 && result.stats.logicalBytes === 4096, result.stats);
check('Statistik sammelt die Blob-Hashes', result.stats.blobHashes.length === 1, result.stats.blobHashes);

result = validateManifest(baseManifest({ manifestVersion: 2 }));
check('falsche manifestVersion -> ungueltig', result.valid === false, result.issues);

result = validateManifest(baseManifest({ instanceId: 'nicht gueltig!' }));
check('kaputte instanceId -> ungueltig', result.valid === false, result.issues);

result = validateManifest(baseManifest({ name: '' }));
check('leerer Name -> ungueltig', result.valid === false, result.issues);

result = validateManifest(null);
check('null -> ungueltig', result.valid === false, result.issues);

result = validateManifest(baseManifest({ entries: 'keine Liste' }));
check('entries kein Array -> ungueltig', result.valid === false, result.issues);

result = validateManifest(baseManifest(), { maxEntries: 0 });
check('zu viele Eintraege -> ungueltig', result.valid === false, result.issues);

section('4) Eintraege');

result = validateManifest(baseManifest({ entries: [baseEntry({ path: '../evil' })] }));
check('Traversal im Eintrag -> invalid_path',
    result.valid === false && result.issues.some((i) => i.reason === 'invalid_path'), result.issues);

result = validateManifest(baseManifest({ entries: [baseEntry(), baseEntry()] }));
check('doppelter Pfad -> duplicate_path',
    result.valid === false && result.issues.some((i) => i.reason === 'duplicate_path'), result.issues);

result = validateManifest(baseManifest({ entries: [baseEntry({ sha256: 'kurz' })] }));
check('kaputter sha256 -> ungueltig', result.valid === false, result.issues);

result = validateManifest(baseManifest({ entries: [baseEntry({ sha256: 'A'.repeat(64) })] }));
check('sha256 in Grossbuchstaben -> ungueltig', result.valid === false, result.issues);

result = validateManifest(baseManifest({ entries: [baseEntry({ size: -1 })] }));
check('negative Groesse -> ungueltig', result.valid === false, result.issues);

const noSource = baseEntry();
delete noSource.blob;
result = validateManifest(baseManifest({ entries: [noSource] }));
check('Eintrag ohne Quelle -> ungueltig', result.valid === false, result.issues);

result = validateManifest(baseManifest({
    entries: [baseEntry({
        source: { type: 'modrinth', projectId: 'AANobbMI', versionId: 'abcd1234', sha1: 'b'.repeat(40) }
    })]
}));
check('Eintrag mit blob UND source -> ungueltig', result.valid === false, result.issues);

const modEntry = {
    path: 'mods/sodium.jar',
    size: 1048576,
    mtime: 1756500000000,
    sha256: 'c'.repeat(64),
    source: { type: 'modrinth', projectId: 'AANobbMI', versionId: 'abcd1234', sha1: 'b'.repeat(40) }
};
result = validateManifest(baseManifest({ entries: [modEntry] }));
check('reiner Modrinth-Eintrag ist gueltig', result.valid === true, result.issues);
check('Referenz erzeugt keinen Blob-Hash', result.stats.blobHashes.length === 0, result.stats.blobHashes);

result = validateManifest(baseManifest({
    entries: [{ ...modEntry, source: { ...modEntry.source, type: 'curseforge' } }]
}));
check('fremder Quelltyp -> ungueltig', result.valid === false, result.issues);

result = validateManifest(baseManifest({
    entries: [{ ...modEntry, source: { ...modEntry.source, sha1: 'zz' } }]
}));
check('kaputter sha1 in der Quelle -> ungueltig', result.valid === false, result.issues);

const chunkEntry = {
    path: 'saves/Skyblock/region/r.0.0.mca',
    size: 8388608,
    mtime: 1756582900000,
    sha256: 'd'.repeat(64),
    chunks: { algo: 'fastcdc-1M', list: 'e'.repeat(64) }
};
result = validateManifest(baseManifest({ entries: [chunkEntry] }));
check('gechunkter Eintrag ist gueltig', result.valid === true, result.issues);
check('Chunk-Liste zaehlt als Blob',
    result.stats.blobHashes.includes('e'.repeat(64)), result.stats.blobHashes);
check('saves-Eintrag setzt hasWorlds', result.stats.hasWorlds === true, result.stats);

result = validateManifest(baseManifest({ entries: [{ ...chunkEntry, chunks: { algo: 'boese algo', list: 'e'.repeat(64) } }] }));
check('unbekannter Chunk-Algorithmus -> ungueltig', result.valid === false, result.issues);

section('5) Icon');

result = validateManifest(baseManifest({ icon: { blob: 'f'.repeat(64) } }));
check('Icon-Blob ist gueltig und zaehlt mit',
    result.valid === true && result.stats.blobHashes.includes('f'.repeat(64)), result.stats.blobHashes);

result = validateManifest(baseManifest({ icon: { blob: 'nope' } }));
check('kaputter Icon-Blob -> ungueltig', result.valid === false, result.issues);

section('6) Groesse');

const many = [];
for (let i = 0; i < 200; i += 1) {
    many.push(baseEntry({ path: `config/file-${i}.json`, size: 100 }));
}
result = validateManifest(baseManifest({ entries: many }));
check('200 Eintraege sind gueltig', result.valid === true, result.issues.slice(0, 3));
check('Bytes werden aufsummiert', result.stats.logicalBytes === 20000, result.stats.logicalBytes);
check('identische Blobs werden nur einmal gezaehlt',
    result.stats.blobHashes.length === 1, result.stats.blobHashes.length);

const broken = [];
for (let i = 0; i < 300; i += 1) {
    broken.push(baseEntry({ path: `config/file-${i}.json`, sha256: 'kaputt' }));
}
result = validateManifest(baseManifest({ entries: broken }));
check('die Fehlerliste wird begrenzt', result.valid === false && result.issues.length <= 202, result.issues.length);

console.log(`\n=== ${passed} bestanden, ${failed} fehlgeschlagen ===`);
process.exit(failed === 0 ? 0 : 1);
