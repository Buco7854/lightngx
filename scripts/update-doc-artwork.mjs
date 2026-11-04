// Render the committed banner/social artwork from a freshly captured editor.
// Usage: node scripts/update-doc-artwork.mjs /path/to/editor-work-sheet.png
// The SVGs embed their font and screenshot; no remote resources are required.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const screenshot = process.argv[2];
if (!screenshot) throw new Error('Pass the editor work-sheet PNG captured from the current app.');
const dir = resolve('docs/static/img');
const font = readFileSync('docs/static/fonts/ibm-plex-sans-latin.woff2').toString('base64');
const editor = readFileSync(screenshot).toString('base64');
const mark = (x, y, scale) => `<g transform="translate(${x} ${y}) scale(${scale})"><polygon points="50 14 81.2 32 81.2 68 50 86 18.8 68 18.8 32" fill="#23764d" stroke="#23764d" stroke-width="12" stroke-linejoin="round"/><path d="M38 35v30h24" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/></g>`;
for (const [name, width, height, tall] of [['banner',1120,400,false], ['social-card',1200,630,true]]) {
  const x = tall ? 520 : 490, y = tall ? 68 : 36;
  const w = tall ? 640 : 680, h = tall ? 560 : 480;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Lightngx — a lightweight web UI for managing nginx">
  <defs>
    <style>@font-face{font-family:Plex;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 700}text{font-family:Plex,sans-serif}</style>
    <clipPath id="canvas"><rect width="${width}" height="${height}" rx="${tall?0:8}"/></clipPath>
  </defs>
  <g clip-path="url(#canvas)">
    <rect width="${width}" height="${height}" fill="#f2f5f3"/>
    ${mark(tall?48:40,tall?128:62,tall?.6:.5)}
    <text x="${tall?124:104}" y="${tall?176:103}" font-size="${tall?52:44}" font-weight="600" letter-spacing="-1.5" fill="#1b2922">Lightngx</text>
    <text x="${tall?56:44}" y="${tall?264:182}" font-size="${tall?34:27}" font-weight="400" fill="#1b2922">A lightweight web UI</text>
    <text x="${tall?56:44}" y="${tall?308:218}" font-size="${tall?34:27}" font-weight="400" fill="#1b2922">for managing nginx.</text>
    <text x="${tall?56:44}" y="${tall?468:339}" font-size="${tall?18:15}" fill="#5c6b62">Configuration · Sites · Live logs</text>
    <image x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMinYMin meet" href="data:image/png;base64,${editor}"/>
  </g>
</svg>\n`;
  writeFileSync(`${dir}/${name}.svg`,svg);
}
