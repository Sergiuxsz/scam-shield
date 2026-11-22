// Renders the design-system cat (ui/app/design-system/bundle.js) to PNGs for the slides.
const fs = require('fs'), path = require('path');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server'), sharp = require('sharp');
const DS = path.resolve(__dirname, '../ui/app/design-system');
global.window = { React };
eval(fs.readFileSync(path.join(DS, 'bundle.js'), 'utf8'));
const S = global.window.ScamShield;
const vars = {}; for (const m of fs.readFileSync(path.join(DS, 'tokens.css'), 'utf8').matchAll(/(--cat-[a-z-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
const css = (fs.readFileSync(path.join(DS, 'bundle.css'), 'utf8').match(/\.ss-cat [^{]*\{[^}]*\}/g) || []).join('\n')
  .replace(/var\((--cat-[a-z-]+)\)/g, (_, v) => vars[v]).replace(/\.ss-cat (\.)/g, '$1');
const tilt = '.is-tilted{transform:rotate(-8deg);transform-origin:24px 40px}';
const jobs = [['sleeping', 'full'], ['idle', 'full'], ['checking', 'full'], ['safe', 'full'], ['suspicious', 'full'], ['scam', 'full'],
              ['scam', 'head', 'sign'], ['idle', 'head']];
(async () => {
  for (const [mood, form, paws] of jobs) {
    let svg = renderToStaticMarkup(React.createElement(S.Mascot, { mood, form, paws, size: 512 }));
    svg = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replace(/class="/g, 'class="').replace('>', `><style>${css}${tilt}</style>`);
    const name = `cat_${mood}_${form}${paws ? '_' + paws : ''}.png`;
    await sharp(Buffer.from(svg), { density: 300 }).resize({ width: 600 }).png().toFile(path.join(__dirname, 'cat', name));
    console.log(name);
  }
})();
