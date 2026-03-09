const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            if (!file.includes('.git') && !file.includes('node_modules')) {
                results = results.concat(walk(file));
            }
        } else {
            if (file.endsWith('.html') || file.endsWith('.js') || file.endsWith('.css') || file.endsWith('.json')) {
                if (!file.endsWith('package-lock.json')) {
                    results.push(file);
                }
            }
        }
    });
    return results;
}

const files = walk('c:\\Users\\Max\\Documents\\GitHub\\Lux-Website');

let updatedFiles = 0;

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    // Colors
    content = content.replace(/#e27602/gi, '#e27602');
    content = content.replace(/#b05900/gi, '#b05900');
    content = content.replace(/rgba\(\s*27\s*,\s*217\s*,\s*106/g, 'rgba(226, 118, 2');
    content = content.replace(/rgba\(\s*27\s*,\s*232\s*,\s*123/g, 'rgba(226, 118, 2');
    content = content.replace(/rgba\(\s*0\s*,\s*255\s*,\s*136/g, 'rgba(226, 118, 2');

    // Texts
    content = content.replace(/Lux-Client/g, 'Lux-Client'); 
    content = content.replace(/Lux Client/g, 'Lux Client');
    content = content.replace(/Lux-Client-setup/g, 'Lux-Client-setup');
    content = content.replace(/lux-client/g, 'lux-client'); // replace lowercase lux-client with lux-client
    
    // Fix things we might have broken
    content = content.replace(/github\.com\/Fernsehheft\/lux-client/gi, 'github.com/Fernsehheft/MCLC-Client');
    content = content.replace(/github\.com\/Lux Client-Client\/Lux-Client/gi, 'github.com/Lux-Client/Lux-Client');
    content = content.replace(/github\.com\/Lux Client-Client/gi, 'github.com/Lux-Client');
    content = content.replace(/github\.com\/Lux-Client\/Lux-Client/gi, 'github.com/Lux-Client/Lux-Client');
    content = content.replace(/lux-client_website/gi, 'lux_website');
    content = content.replace(/\.luxextension/g, '.luxextension');
    content = content.replace(/Lux Client\.pluginhub\.de/gi, 'lux.pluginhub.de'); 
    content = content.replace(/lux-client\.pluginhub\.de/gi, 'lux.pluginhub.de');
    content = content.replace(/\[Lux Client\]/g, '[Lux]');
    
    // Revert process.env.DB_NAME fallback if needed, or keep lux_website
    
    // Fix "Lux Client" if it happens
    content = content.replace(/Lux Client/g, 'Lux Client');
    
    if (content !== original) {
        fs.writeFileSync(file, content, 'utf8');
        console.log('Updated', file);
        updatedFiles++;
    }
});

console.log(`Total files updated: ${updatedFiles}`);
