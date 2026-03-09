const fs = require('fs');

function fixFiles() {
    // 1. server.js
    let srv = fs.readFileSync('server.js', 'utf8');
    srv = srv.replace(/lux-client-super-secret-session-key-2026/g, 'mclc-super-secret-session-key-2026');
    srv = srv.replace(/Lux-Client\/1\.0\.0 \(lux-client@pluginhub\.de\)/g, 'MCLC/1.0.0 (mclc@pluginhub.de)');
    fs.writeFileSync('server.js', srv);

    // 2. index.html
    let idx = fs.readFileSync('index.html', 'utf8');
    idx = idx.replace(/const REPO = 'Lux-Client\/Lux-Client';/g, "const REPO = 'MCLC-Client/MCLC-Client';");
    idx = idx.replace(/github\.com\/Lux-Client\/Lux-Client/g, "github.com/MCLC-Client/MCLC-Client");
    idx = idx.replace(/Lux-Client-setup/g, "MCLC-setup");
    fs.writeFileSync('index.html', idx);

    // 3. extensions.html
    if (fs.existsSync('extensions.html')) {
        let ext = fs.readFileSync('extensions.html', 'utf8');
        ext = ext.replace(/Fernsehheft\/Lux-Client/g, 'Fernsehheft/MCLC-Client');
        fs.writeFileSync('extensions.html', ext);
    }

    // 4. docs/index.html
    if (fs.existsSync('docs/index.html')) {
        let docs = fs.readFileSync('docs/index.html', 'utf8');
        docs = docs.replace(/github\.com\/Lux-Client\/Lux-Client/g, "github.com/MCLC-Client/MCLC-Client");
        fs.writeFileSync('docs/index.html', docs);
    }

    // 5. database.js
    if (fs.existsSync('database.js')) {
        let db = fs.readFileSync('database.js', 'utf8');
        db = db.replace(/lux-client_website/g, 'mclc_website');
        fs.writeFileSync('database.js', db);
    }

    // 6. sync-release.js
    if (fs.existsSync('sync-release.js')) {
        let sync = fs.readFileSync('sync-release.js', 'utf8');
        sync = sync.replace(/Fernsehheft\/Lux-Client/g, 'Fernsehheft/MCLC-Client');
        fs.writeFileSync('sync-release.js', sync);
    }

    // 7. package.json
    if (fs.existsSync('package.json')) {
        let pkg = fs.readFileSync('package.json', 'utf8');
        pkg = pkg.replace(/lux-client-news-admin/g, 'mclc-news-admin');
        fs.writeFileSync('package.json', pkg);
    }
}
fixFiles();
