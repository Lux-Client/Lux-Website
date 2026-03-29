/**
 * Simple Express.js dev server for local development.
 * No env vars required. Logging and analytics are local/test only.
 */

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// --- Dev-friendly log ---
function getTimestamp() {
    return new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
}
const log = (...args) => {
    console.log(`[${getTimestamp()}]`, ...args);
};

const allowedOrigins = ['http://localhost:5173', 'http://localhost:3001', 'http://localhost:3000'];

const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling']
});

// --- Basic analytics emulation ---
let stats = {
    downloads: { mod: {}, resourcepack: {}, shader: {}, modpack: {} },
    launchesPerDay: {},
    clientVersions: {},
    uniqueMachineCount: 0,
    uniqueMachines: {},
    software: { client: {}, server: {} },
    gameVersions: { client: {}, server: {} }
};
const activeSessions = new Map();

function getLiveStats() {
    let activeUsers = 0;
    let playingUsers = 0;
    const versions = {};
    const playingInstances = {};
    const activeMachineKeys = new Set();
    const playingMachineKeys = new Set();

    activeSessions.forEach((session, socketId) => {
        const machineKey = String(session?.machineId || '').trim() || `socket:${socketId}`;

        if (session.version && session.version !== 'unknown') {
            if (!activeMachineKeys.has(machineKey)) {
                activeMachineKeys.add(machineKey);
                activeUsers++;
            }

            if (session.isPlaying) {
                if (!playingMachineKeys.has(machineKey)) {
                    playingMachineKeys.add(machineKey);
                    playingUsers++;
                }
                if (session.instance) {
                    playingInstances[session.instance] = (playingInstances[session.instance] || 0) + 1;
                }
            }
        }
        if (session.version && session.version !== 'unknown') {
            versions[session.version] = (versions[session.version] || 0) + 1;
        }
    });

    return {
        activeUsers,
        playingUsers,
        versions,
        playingInstances
    };
}

function emitLiveStats() {
    io.to('admin').emit('live-update', {
        live: getLiveStats(),
        persistent: stats
    });
}

// --- Socket.io simple dev analytics ---
io.on('connection', (socket) => {
    activeSessions.set(socket.id, {
        version: 'unknown',
        os: 'unknown',
        isPlaying: false,
        instance: null,
        startTime: Date.now()
    });

    emitLiveStats();

    socket.on('register', (data) => {
        const machineId = String(data?.machineId || '').trim();

        if (machineId) {
            for (const [existingSocketId, existingSession] of activeSessions.entries()) {
                if (existingSocketId === socket.id) continue;
                if (String(existingSession?.machineId || '').trim() === machineId) {
                    activeSessions.delete(existingSocketId);
                }
            }
        }

        const session = activeSessions.get(socket.id);
        if (session) {
            session.version = data.version || 'unknown';
            session.os = data.os || 'unknown';
            session.username = data.username || 'Anonymous';
            session.uuid = data.uuid || null;
            session.machineId = machineId || null;
            activeSessions.set(socket.id, session);
        }

        if (machineId && !stats.uniqueMachines[machineId]) {
            stats.uniqueMachines[machineId] = {
                firstSeenAt: Date.now(),
                version: data?.version || 'unknown',
                os: data?.os || 'unknown'
            };
            stats.uniqueMachineCount = Object.keys(stats.uniqueMachines).length;
        }

        if (data.version) {
            stats.clientVersions[data.version] = (stats.clientVersions[data.version] || 0) + 1;
        }

        emitLiveStats();
    });

    socket.on('update-status', (data) => {
        const session = activeSessions.get(socket.id);
        if (session) {
            if (data.isPlaying && !session.isPlaying) {
                const today = new Date().toISOString().split('T')[0];
                stats.launchesPerDay[today] = (stats.launchesPerDay[today] || 0) + 1;

                const mode = data.mode === 'server' ? 'server' : 'client';
                if (data.software) {
                    stats.software[mode][data.software] = (stats.software[mode][data.software] || 0) + 1;
                }
                if (data.gameVersion) {
                    stats.gameVersions[mode][data.gameVersion] = (stats.gameVersions[mode][data.gameVersion] || 0) + 1;
                }
            }

            session.isPlaying = data.isPlaying;
            session.instance = data.instance || null;
            activeSessions.set(socket.id, session);
        }
        emitLiveStats();
        io.to('admin').emit('live-update', {
            live: getLiveStats(),
            persistent: stats
        });
    });

    socket.on('disconnect', () => {
        activeSessions.delete(socket.id);
        emitLiveStats();
    });
});

// --- Basic CORS/body-parser config ---
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- Mock News json endpoint, with writes to ./news.dev.json ---
const NEWS_FILE = path.join(__dirname, 'news.dev.json');
const getNews = () => {
    if (!fs.existsSync(NEWS_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(NEWS_FILE, 'utf8'));
    } catch {
        return [];
    }
};
const saveNews = (data) => fs.writeFileSync(NEWS_FILE, JSON.stringify(data, null, 2));

app.get('/news.json', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    res.json(getNews());
});

app.get('/api/news', (req, res) => {
    res.json(getNews());
});
app.post('/api/news', (req, res) => {
    const { news } = req.body;
    try {
        saveNews(news || []);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- API analytics (no auth, just for dev) ---
app.post('/api/analytics', (req, res) => {
    res.json({
        live: getLiveStats(),
        persistent: stats
    });
});

// --- Static file serving (DEV: just serve local ./public if exists) ---
const staticDir = fs.existsSync(path.join(__dirname, 'public')) ?
    path.join(__dirname, 'public') :
    __dirname;

app.use(express.static(staticDir, {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        }
        if (filePath.endsWith('.luxextension')) {
            res.setHeader('Content-Type', 'application/octet-stream');
        }
    }
}));

// --- Simple HTML routes/legacy redirects for dev ---
app.get('/', (req, res) => {
    const htmlPath = path.join(__dirname, 'html', 'index.html');
    if (fs.existsSync(htmlPath)) {
        res.sendFile(htmlPath);
    } else {
        res.send('<h2>Express dev server</h2>');
    }
});
// basic legacy redirect example
app.get('/index.html', (req, res) => res.redirect('/'));

app.get('/extensions/:identifier', (req, res) => {
    const detail = path.join(__dirname, 'html', 'extension_detail.html');
    if (fs.existsSync(detail)) {
        res.sendFile(detail);
    } else {
        res.send('<h3>Extension detail (dev)</h3>');
    }
});

// --- Start server ---
const DEV_PORT = 3001;
server.listen(DEV_PORT, () => {
    log(`Dev Server (no env keys required) running at http://localhost:${DEV_PORT}`);
});