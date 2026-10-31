/**
 * tests/pwa_and_offline.test.js
 * Automated verification for PWA manifest compliance, Service Worker offline
 * cache rules, and accessibility standards.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

function run() {
    console.log('[Test: PWA & Offline] Starting verification...');

    const rootDir = path.resolve(__dirname, '..');
    const manifestPath = path.join(rootDir, 'manifest.json');
    const swPath = path.join(rootDir, 'sw.js');
    const indexPath = path.join(rootDir, 'index.html');
    const iconPath = path.join(rootDir, 'icons', 'icon.svg');

    // 1. Manifest
    assert(fs.existsSync(manifestPath), 'manifest.json must exist');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    assert.strictEqual(manifest.name, 'ICT MC 歷年試題庫');
    assert.strictEqual(manifest.display, 'standalone');
    assert.strictEqual(manifest.start_url, './index.html');
    assert(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'manifest must specify icons');

    // Verify physical icon exists
    assert(fs.existsSync(iconPath), 'icons/icon.svg must exist');
    const iconStat = fs.statSync(iconPath);
    assert(iconStat.size > 100, 'icons/icon.svg must not be empty');

    // 2. Service Worker
    assert(fs.existsSync(swPath), 'sw.js must exist');
    const swContent = fs.readFileSync(swPath, 'utf8');

    assert(swContent.includes('CACHE_NAME'), 'sw.js must define cache name');
    assert(swContent.includes('PRECACHE_ASSETS'), 'sw.js must define precached assets');
    assert(swContent.includes('./data/papers.json'), 'sw.js must precache papers.json');
    assert(swContent.includes('./data/answers.json'), 'sw.js must precache answers.json');
    assert(swContent.includes('./data/ocr.json'), 'sw.js must precache ocr.json');
    assert(swContent.includes('/Paper/'), 'sw.js must handle paper images cache-first');

    // 3. HTML Standards & Accessibility
    assert(fs.existsSync(indexPath), 'index.html must exist');
    const indexContent = fs.readFileSync(indexPath, 'utf8');

    // A11y: Viewport must NOT disable zoom
    assert(!indexContent.includes('maximum-scale=1.0, user-scalable=no'), 'Viewport meta must permit user zoom for a11y');
    assert(indexContent.includes('viewport-fit=cover'), 'Viewport meta must include viewport-fit=cover');
    assert(indexContent.includes('manifest.json'), 'index.html must link to manifest.json');
    assert(indexContent.includes('icons/icon.svg'), 'index.html must link to app icon');

    console.log('[Test: PWA & Offline] PASS: Manifest, Service Worker, and PWA assets verified.');
}

module.exports = { run };

if (require.main === module) {
    run();
}
