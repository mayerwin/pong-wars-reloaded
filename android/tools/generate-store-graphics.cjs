#!/usr/bin/env node
// Rebuild the Play feature graphic and Android TV banner from deterministic
// vector sources. Run: node android/tools/generate-store-graphics.cjs
// Requires sharp (npm install --no-save sharp), or the bundled Codex runtime.
// These are promotional illustrations, not game screenshots. The existing
// store-assets/icon-512.png is maintained separately from the launcher icon.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
let sharp;
try { sharp = require('sharp'); }
catch (_) {
  sharp = require(path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'sharp'));
}
const destination = path.resolve(__dirname, '../publishing/store-assets');
const root = path.resolve(__dirname, '../..');
const colors = {dark:'#172B36', mint:'#D9E8E3', cyan:'#00D2D3', teal:'#114C5A'};

// An original compact block alphabet, stored as geometry rather than depending
// on locally installed fonts. The exported SVGs contain no external resources.
const alphabet = {
  A:['01110','11011','11011','11111','11011','11011','11011'],
  D:['11110','11011','11011','11011','11011','11011','11110'],
  E:['11111','11000','11000','11110','11000','11000','11111'],
  G:['01111','11000','11000','11011','11011','11011','01110'],
  H:['11011','11011','11011','11111','11011','11011','11011'],
  I:['11111','00100','00100','00100','00100','00100','11111'],
  L:['11000','11000','11000','11000','11000','11000','11111'],
  N:['11001','11101','11101','11011','11011','11011','11001'],
  O:['01110','11011','11011','11011','11011','11011','01110'],
  P:['11110','11011','11011','11110','11000','11000','11000'],
  R:['11110','11011','11011','11110','11100','11010','11011'],
  S:['01111','11000','11000','01110','00011','00011','11110'],
  T:['11111','00100','00100','00100','00100','00100','00100'],
  U:['11011','11011','11011','11011','11011','11011','01110'],
  V:['11011','11011','11011','11011','01010','01010','00100'],
  W:['10001','10001','10001','10101','10101','11011','10001'],
  Y:['10001','10001','01010','00100','00100','00100','00100'],
};
function lettering(text, x, y, scale, color) {
  const paths = [];
  for (let letter = 0; letter < text.length; letter++) {
    if (text[letter] === ' ') continue;
    const rows = alphabet[text[letter]];
    if (!rows) throw new Error('Missing vector letter: ' + text[letter]);
    rows.forEach((row, j) => {
      for (const match of row.matchAll(/1+/g)) {
        const px = (letter * 6 + match.index) * scale + x, py = j * scale + y;
        paths.push(`M${px},${py}h${match[0].length * scale}v${scale}h-${match[0].length * scale}z`);
      }
    });
  }
  return `<g aria-label="${text}"><path fill="${color}" d="${paths.join('')}"/></g>`;
}
function graphic(width, height, icon) {
  const tv = width === 1280;
  const left = tv ? 80 : 56;
  const titleY = tv ? 246 : 180;
  const titleScale = tv ? 12 : 9;
  const subScale = tv ? 10 : 8;
  const boardSize = tv ? 408 : 342;
  const boardX = width - boardSize - (tv ? 58 : 32);
  const boardY = (height - boardSize) / 2;
  const eyebrowY = titleY - (tv ? 65 : 58);
  const ornament = [];
  for (let i = 0; i < 12; i++) {
    const x = left + i * (tv ? 29 : 24), y = tv ? 570 : 398;
    ornament.push(`<rect x="${x}" y="${y}" width="${tv ? 20 : 16}" height="${tv ? 20 : 16}" fill="${i < 6 ? colors.mint : colors.teal}" opacity="${i === 5 || i === 6 ? '.65' : '.18'}"/>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
  <title id="title">Pong Wars Reloaded</title>
  <desc id="description">Day versus night. Original vector brand artwork featuring the game's two opposing balls and paddles. Promotional art, not a screenshot.</desc>
  <rect width="${width}" height="${height}" fill="${colors.dark}"/>
  <path d="M${width},0H${Math.round(width * .82)}L${Math.round(width * .66)},${height}H${width}Z" fill="${colors.teal}" opacity=".18"/>
  <rect x="${left}" y="${eyebrowY}" width="${tv ? 48 : 36}" height="4" fill="${colors.cyan}"/>
  ${lettering('DAY VERSUS NIGHT', left + (tv ? 66 : 52), eyebrowY - 6, 2, colors.mint)}
  ${lettering('PONG WARS', left, titleY, titleScale, colors.mint)}
  ${lettering('RELOADED', left, titleY + 7 * titleScale + (tv ? 27 : 22), subScale, colors.cyan)}
  ${ornament.join('\n  ')}
  <g transform="translate(${boardX} ${boardY}) scale(${boardSize / 512})">${icon}</g>
</svg>
`;
}

(async () => {
  const source = await fs.readFile(path.join(root, 'icon.svg'), 'utf8');
  const icon = source.replace(/^[\s\S]*?<svg\b[^>]*>/, '').replace(/<\/svg>[\s\S]*$/, '').trim();
  await fs.mkdir(destination, {recursive:true});
  for (const [name, width, height] of [['feature-graphic-1024x500',1024,500], ['tv-banner-1280x720',1280,720]]) {
    const svg = graphic(width, height, icon);
    await fs.writeFile(path.join(destination, name + '.svg'), svg, 'utf8');
    await sharp(Buffer.from(svg)).flatten({background:colors.dark}).removeAlpha().png({compressionLevel:9}).toFile(path.join(destination, name + '.png'));
    const metadata = await sharp(path.join(destination, name + '.png')).metadata();
    if (metadata.width !== width || metadata.height !== height || metadata.hasAlpha) throw new Error('Invalid exported image: ' + name);
    process.stdout.write(`${name}.png: ${width} x ${height}, RGB, opaque\n`);
  }
})().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
