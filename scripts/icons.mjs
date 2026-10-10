// Renders the app icon (one belt-and-knot mark) to every size iOS, Android and browsers want:
//   public/favicon.svg, favicon.ico (16 + 32), favicon-32.png, apple-touch-icon.png (180, full bleed),
//   pwa-192.png / pwa-512.png (rounded), pwa-maskable-512.png (full bleed, mark inside the safe zone).
// Run: node scripts/icons.mjs  (uses Playwright's Chromium)
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BG = '#14161c';
const BLUE = '#2f6fd6';
const INK = '#0a0f1a';

/** The mark on a 512 grid. `scale` shrinks it about the centre (maskable icons need a safe zone). */
function mark(scale = 1) {
  return `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <rect x="44" y="214" width="424" height="76" rx="12" fill="${BLUE}" stroke="${INK}" stroke-width="8"/>
    <rect x="44" y="220" width="424" height="14" rx="6" fill="#fff" opacity="0.14"/>
    <rect x="356" y="218" width="72" height="68" fill="#111318"/>
    <rect x="374" y="218" width="10" height="68" fill="#fff"/>
    <rect x="396" y="218" width="10" height="68" fill="#fff"/>
    <path d="M232 280 L186 434 L222 444 L256 300 Z" fill="${BLUE}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
    <path d="M280 280 L326 434 L290 444 L256 300 Z" fill="${BLUE}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
    <rect x="214" y="196" width="84" height="112" rx="20" fill="${BLUE}" stroke="${INK}" stroke-width="8"/>
    <path d="M232 222 h48" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity="0.18"/>
  </g>`;
}

const svg = ({ rounded, scale = 1 }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${rounded ? `<rect width="512" height="512" rx="112" fill="${BG}"/>` : `<rect width="512" height="512" fill="${BG}"/>`}${mark(scale)}</svg>`;

writeFileSync('public/favicon.svg', svg({ rounded: true, scale: 1.04 }) + '\n');

const browser = await chromium.launch();
const page = await browser.newPage();
async function png(markup, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${markup.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

const out = {
  'apple-touch-icon.png': [svg({ rounded: false, scale: 0.86 }), 180],
  'pwa-192.png': [svg({ rounded: true }), 192],
  'pwa-512.png': [svg({ rounded: true }), 512],
  'pwa-maskable-512.png': [svg({ rounded: false, scale: 0.72 }), 512],
  'favicon-32.png': [svg({ rounded: true, scale: 1.08 }), 32],
};
for (const [name, [markup, size]] of Object.entries(out)) writeFileSync(`public/${name}`, await png(markup, size));

// favicon.ico: PNG-compressed images in an ICO container (every current browser reads these).
const sizes = [16, 32];
const images = [];
for (const s of sizes) images.push(await png(svg({ rounded: true, scale: 1.12 }), s));
const header = Buffer.alloc(6 + 16 * images.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach((img, i) => {
  const e = 6 + i * 16;
  header.writeUInt8(sizes[i], e);
  header.writeUInt8(sizes[i], e + 1);
  header.writeUInt8(0, e + 2);
  header.writeUInt8(0, e + 3);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(img.length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += img.length;
});
writeFileSync('public/favicon.ico', Buffer.concat([header, ...images]));
await browser.close();
console.log('icons written');
