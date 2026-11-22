/*
 * Renders the app icons (the cat on the brand teal) into app/icons/.
 * Run: npx electron tools/make-icons.js   (from the desktop folder)
 */
'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const APP = path.resolve(__dirname, '..', '..', 'app');
const OUT = path.join(APP, 'icons');
const url = (p) => 'file:///' + path.join(APP, p).replace(/\\/g, '/');

// "any": rounded tile, cat large. "maskable": full bleed, cat inside the 80% safe zone.
function page(maskable) {
  const cat = maskable ? 300 : 360;
  return `<!doctype html><html data-theme="dark"><head><meta charset="utf-8">
<link rel="stylesheet" href="${url('design-system/tokens.css')}"><link rel="stylesheet" href="${url('design-system/bundle.css')}">
<style>html,body{margin:0;width:512px;height:512px;overflow:hidden;background:transparent}
.tile{width:512px;height:512px;display:grid;place-items:center;background:#12505f;border-radius:${maskable ? 0 : 112}px}
.ss-cat *{animation:none!important}</style></head><body><div class="tile" id="t"></div>
<script src="${url('vendor/react.production.min.js')}"></script><script src="${url('vendor/react-dom.production.min.js')}"></script>
<script src="${url('design-system/bundle.js')}"></script>
<script>ReactDOM.createRoot(document.getElementById('t')).render(React.createElement(ScamShield.Mascot,{mood:'idle',paws:'rest',size:${cat}}));</script>
</body></html>`;
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  // One window for both renders: a second offscreen window fails to load on some setups.
  const win = new BrowserWindow({ width: 512, height: 512, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } });
  const files = [];
  try {
    for (const [name, maskable] of [['icon', false], ['icon-maskable', true]]) {
      const file = path.join(__dirname, '_render-' + name + '.html');
      files.push(file);
      fs.writeFileSync(file, page(maskable));
      await win.loadFile(file);
      await new Promise((r) => setTimeout(r, 600));
      const img = (await win.webContents.capturePage()).resize({ width: 512, height: 512 });
      fs.writeFileSync(path.join(OUT, name + '-512.png'), img.toPNG());
      if (!maskable) {
        fs.writeFileSync(path.join(OUT, 'icon-192.png'), img.resize({ width: 192, height: 192, quality: 'best' }).toPNG());
        fs.writeFileSync(path.join(OUT, 'icon-180.png'), img.resize({ width: 180, height: 180, quality: 'best' }).toPNG());
      }
    }
    console.log('icons written to ' + OUT);
  } catch (e) {
    console.error('icon rendering failed: ' + e.message);
  } finally {
    win.destroy();
    files.forEach((f) => fs.rmSync(f, { force: true }));
    app.quit();
  }
});
