const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

function createFsStorage({ root }) {
    const baseDir = path.resolve(root);

    function resolveKey(key) {
        const target = path.resolve(baseDir, key);
        if (target !== baseDir && !target.startsWith(baseDir + path.sep)) {
            throw new Error(`Storage key escapes the storage root: ${key}`);
        }
        return target;
    }

    async function put(key, source, meta = {}) {
        const target = resolveKey(key);
        await fsp.mkdir(path.dirname(target), { recursive: true });

        const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
        if (Buffer.isBuffer(source)) {
            await fsp.writeFile(tmp, source);
        } else {
            await new Promise((resolve, reject) => {
                const out = fs.createWriteStream(tmp);
                source.on('error', reject);
                out.on('error', reject);
                out.on('finish', resolve);
                source.pipe(out);
            });
        }

        await fsp.rename(tmp, target);
        const stat = await fsp.stat(target);

        if (meta.compression || meta.originalSize) {
            await fsp.writeFile(`${target}.meta`, JSON.stringify(meta), 'utf8');
        }
        return { key, storedSize: stat.size };
    }

    async function get(key) {
        const target = resolveKey(key);
        const stat = await fsp.stat(target);
        return { stream: fs.createReadStream(target), size: stat.size };
    }

    async function head(key) {
        try {
            const stat = await fsp.stat(resolveKey(key));
            return { size: stat.size, lastModified: stat.mtime };
        } catch (err) {
            if (err.code === 'ENOENT') return null;
            throw err;
        }
    }

    async function remove(keys) {
        let deleted = 0;
        for (const key of keys) {
            try {
                await fsp.unlink(resolveKey(key));
                deleted += 1;
            } catch (err) {
                if (err.code !== 'ENOENT') throw err;
            }
            await fsp.rm(`${resolveKey(key)}.meta`, { force: true });
        }
        return { deleted };
    }

    async function list(prefix = '') {
        const start = resolveKey(prefix);
        const entries = [];

        async function walk(dir) {
            let dirents;
            try {
                dirents = await fsp.readdir(dir, { withFileTypes: true });
            } catch (err) {
                if (err.code === 'ENOENT') return;
                throw err;
            }
            for (const dirent of dirents) {
                const full = path.join(dir, dirent.name);
                if (dirent.isDirectory()) {
                    await walk(full);
                } else if (!dirent.name.endsWith('.meta') && !dirent.name.includes('.tmp-')) {
                    const stat = await fsp.stat(full);
                    entries.push({
                        key: path.relative(baseDir, full).split(path.sep).join('/'),
                        size: stat.size,
                        lastModified: stat.mtime
                    });
                }
            }
        }

        await walk(start);
        return entries;
    }

    return {
        driver: 'fs',
        canPresign: false,
        baseDir,
        put,
        get,
        head,
        remove,
        list
    };
}

module.exports = { createFsStorage };
