import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(__dirname, '../assets');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1e1638"/>
      <stop offset="55%" stop-color="#3b1f75"/>
      <stop offset="100%" stop-color="#6d28d9"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#c4b5fd"/>
      <stop offset="50%" stop-color="#f472b6"/>
      <stop offset="100%" stop-color="#38bdf8"/>
    </linearGradient>
  </defs>
  <rect x="12" y="12" width="232" height="232" rx="54" fill="url(#bg)"/>
  <rect x="16" y="16" width="224" height="224" rx="50" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="3"/>
  <path d="M74 72 L128 136 L182 72" fill="none" stroke="url(#accent)" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M128 136 L128 190" fill="none" stroke="url(#accent)" stroke-width="22" stroke-linecap="round"/>
  <rect x="54" y="148" width="14" height="36" rx="7" fill="#a78bfa" opacity="0.85"/>
  <rect x="188" y="148" width="14" height="36" rx="7" fill="#38bdf8" opacity="0.85"/>
</svg>
`;

fs.writeFileSync(path.join(ASSETS_DIR, 'icon.svg'), svg, 'utf8');

// Pure-Node RGBA PNG generator (256x256) with anti-aliased SDF shapes
const W = 256;
const H = 256;
const pixels = Buffer.alloc(W * H * 4);

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

function sdRoundedBox(px, py, bx, by, r) {
  const qx = Math.abs(px) - bx + r;
  const qy = Math.abs(py) - by + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function sdSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1);
  return Math.hypot(pax - bax * h, pay - bay * h);
}

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const cx = x - 128;
    const cy = y - 128;
    const bgDist = sdRoundedBox(cx, cy, 116, 116, 54);
    const bgAlpha = 1 - smoothstep(-1, 1, bgDist);

    const t = clamp((x + y) / (W + H), 0, 1);
    let r = mix(28, 109, t);
    let g = mix(20, 40, t);
    let b = mix(62, 217, t);

    // Subtle radial highlight
    const glow = Math.exp(-((x - 96) ** 2 + (y - 76) ** 2) / (2 * 90 * 90));
    r = mix(r, 155, glow * 0.25);
    g = mix(g, 92, glow * 0.25);
    b = mix(b, 255, glow * 0.35);

    // Inner subtle border
    const borderDist = Math.abs(sdRoundedBox(cx, cy, 112, 112, 50));
    const borderAlpha = (1 - smoothstep(0, 2.2, borderDist)) * 0.22;
    r = mix(r, 255, borderAlpha);
    g = mix(g, 255, borderAlpha);
    b = mix(b, 255, borderAlpha);

    // Y emblem (left branch, right branch, stem)
    const d1 = sdSegment(x, y, 74, 72, 128, 136);
    const d2 = sdSegment(x, y, 182, 72, 128, 136);
    const d3 = sdSegment(x, y, 128, 136, 128, 190);
    const yDist = Math.min(d1, d2, d3) - 11.5;
    const yAlpha = 1 - smoothstep(-1, 1, yDist);

    // Side soundwave pills
    const bLeft = sdRoundedBox(x - 61, y - 166, 7, 18, 7);
    const bRight = sdRoundedBox(x - 195, y - 166, 7, 18, 7);
    const pillAlpha = Math.max(1 - smoothstep(-1, 1, bLeft), 1 - smoothstep(-1, 1, bRight)) * 0.88;

    const gt = clamp((x - 54) / 148, 0, 1);
    const ar = mix(196, 56, gt);
    const ag = mix(181, 189, gt);
    const ab = mix(253, 248, gt);

    r = mix(r, ar, pillAlpha);
    g = mix(g, ag, pillAlpha);
    b = mix(b, ab, pillAlpha);

    r = mix(r, ar, yAlpha);
    g = mix(g, ag, yAlpha);
    b = mix(b, ab, yAlpha);

    const idx = (y * W + x) * 4;
    pixels[idx] = Math.round(clamp(r, 0, 255));
    pixels[idx + 1] = Math.round(clamp(g, 0, 255));
    pixels[idx + 2] = Math.round(clamp(b, 0, 255));
    pixels[idx + 3] = Math.round(clamp(bgAlpha * 255, 0, 255));
  }
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcBuf), 0);
  return Buffer.concat([len, t, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const rawRows = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  const rowStart = y * (1 + W * 4);
  rawRows[rowStart] = 0; // filter none
  pixels.copy(rawRows, rowStart + 1, y * W * 4, (y + 1) * W * 4);
}
const compressed = zlib.deflateSync(rawRows, { level: 9 });

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  pngChunk('IHDR', ihdr),
  pngChunk('IDAT', compressed),
  pngChunk('IEND', Buffer.alloc(0))
]);

fs.writeFileSync(path.join(ASSETS_DIR, 'icon.png'), png);

// Windows .ico wrapping the 256x256 PNG payload
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0); // reserved
icoHeader.writeUInt16LE(1, 2); // type 1 = icon
icoHeader.writeUInt16LE(1, 4); // 1 image

const icoEntry = Buffer.alloc(16);
icoEntry[0] = 0; // width 0 = 256px
icoEntry[1] = 0; // height 0 = 256px
icoEntry[2] = 0; // colorCount
icoEntry[3] = 0; // reserved
icoEntry.writeUInt16LE(1, 4); // planes
icoEntry.writeUInt16LE(32, 6); // bitCount
icoEntry.writeUInt32LE(png.length, 8); // bytesInRes
icoEntry.writeUInt32LE(22, 12); // imageOffset (6 + 16)

fs.writeFileSync(path.join(ASSETS_DIR, 'icon.ico'), Buffer.concat([icoHeader, icoEntry, png]));
console.log('Generated assets/icon.svg, assets/icon.png, and assets/icon.ico');
