// scripts/generate-favicons.js
// Generates PNG favicon files from raw pixel data — no external dependencies.
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "../public/icons");

// ── PNG encoder (minimal, unoptimised) ──
function createPng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const t = Buffer.from(type, "ascii");
    const payload = Buffer.concat([t, data]);
    const crc = Buffer.alloc(4);
    crc.writeInt32BE(crc32(payload));
    return Buffer.concat([len, payload, crc]);
  }

  // CRC-32
  const crcTable = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c;
  }
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) | 0;
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // IDAT — raw image data with filter byte 0 per row
  const rowLen = width * 4 + 1;
  const raw = Buffer.alloc(height * rowLen);
  for (let y = 0; y < height; y++) {
    raw[y * rowLen] = 0; // filter: none
    rgba.copy(raw, y * rowLen + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = zlib.deflateSync(raw);

  // IEND
  const iend = chunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", compressed), iend]);
}

// ── Drawing helpers ──
function newCanvas(w, h) {
  return { w, h, data: Buffer.alloc(w * h * 4) };
}

function setPixel(c, x, y, r, g, b, a) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || x >= c.w || y < 0 || y >= c.h) return;
  const i = (y * c.w + x) * 4;
  const sa = a / 255;
  const da = c.data[i + 3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa === 0) return;
  c.data[i]     = Math.round((r * sa + c.data[i] * da * (1 - sa)) / oa);
  c.data[i + 1] = Math.round((g * sa + c.data[i + 1] * da * (1 - sa)) / oa);
  c.data[i + 2] = Math.round((b * sa + c.data[i + 2] * da * (1 - sa)) / oa);
  c.data[i + 3] = Math.round(oa * 255);
}

function drawLine(c, x0, y0, x1, y1, r, g, b, a, thickness) {
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1) * 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = x0 + dx * t, cy = y0 + dy * t;
    for (let ox = -thickness; ox <= thickness; ox++) {
      for (let oy = -thickness; oy <= thickness; oy++) {
        const d = Math.sqrt(ox * ox + oy * oy);
        if (d <= thickness) {
          const aa = Math.round(a * Math.max(0, 1 - d / (thickness + 0.5)));
          setPixel(c, cx + ox, cy + oy, r, g, b, aa);
        }
      }
    }
  }
}

function drawCircle(c, cx, cy, radius, r, g, b, a) {
  for (let dy = -radius - 1; dy <= radius + 1; dy++) {
    for (let dx = -radius - 1; dx <= radius + 1; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= radius + 0.5) {
        const aa = Math.round(a * Math.max(0, 1 - Math.max(0, d - radius + 0.5)));
        setPixel(c, cx + dx, cy + dy, r, g, b, aa);
      }
    }
  }
}

function drawIcon(size) {
  const c = newCanvas(size, size);
  const s = size / 64; // scale factor from 64x64 reference

  // Background: transparent (dark for apple-touch)
  if (size >= 180) {
    // Apple touch icons need a solid background
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        setPixel(c, x, y, 10, 10, 14, 255);
  }

  // Parchment outline
  const parchColor = [212, 201, 168]; // #d4c9a8
  const quillColor = [232, 232, 237]; // #e8e8ed
  const inkColor = [168, 139, 212];   // #a88bd4

  const lw = Math.max(1, s * 1.2);

  // Parchment body
  drawLine(c, 16*s, 8*s, 14*s, 10*s, ...parchColor, 180, lw);
  drawLine(c, 14*s, 10*s, 14*s, 52*s, ...parchColor, 180, lw);
  drawLine(c, 14*s, 52*s, 16*s, 56*s, ...parchColor, 180, lw);
  drawLine(c, 16*s, 56*s, 46*s, 56*s, ...parchColor, 180, lw);
  drawLine(c, 46*s, 56*s, 50*s, 52*s, ...parchColor, 180, lw);
  drawLine(c, 50*s, 52*s, 50*s, 14*s, ...parchColor, 180, lw);
  drawLine(c, 50*s, 14*s, 44*s, 8*s, ...parchColor, 180, lw);
  drawLine(c, 44*s, 8*s, 16*s, 8*s, ...parchColor, 180, lw);

  // Fold corner
  drawLine(c, 44*s, 8*s, 44*s, 14*s, ...parchColor, 140, lw * 0.8);
  drawLine(c, 44*s, 14*s, 50*s, 14*s, ...parchColor, 140, lw * 0.8);

  // Text lines
  const tlw = Math.max(0.5, s * 0.6);
  drawLine(c, 20*s, 22*s, 40*s, 22*s, ...parchColor, 70, tlw);
  drawLine(c, 20*s, 28*s, 44*s, 28*s, ...parchColor, 60, tlw);
  drawLine(c, 20*s, 34*s, 42*s, 34*s, ...parchColor, 50, tlw);
  drawLine(c, 20*s, 40*s, 38*s, 40*s, ...parchColor, 40, tlw);

  // Quill shaft
  const qlw = Math.max(1, s * 1.2);
  drawLine(c, 38*s, 50*s, 48*s, 18*s, ...quillColor, 200, qlw);
  drawLine(c, 48*s, 18*s, 54*s, 6*s, ...quillColor, 200, qlw);

  // Feather barbs
  const flw = Math.max(0.5, s * 0.7);
  drawLine(c, 54*s, 6*s, 52*s, 8*s, ...quillColor, 150, flw);
  drawLine(c, 52*s, 8*s, 50*s, 6*s, ...quillColor, 130, flw);
  drawLine(c, 53*s, 8*s, 51*s, 10*s, ...quillColor, 110, flw);
  drawLine(c, 51*s, 10*s, 48*s, 8*s, ...quillColor, 90, flw);

  // Nib
  drawLine(c, 38*s, 50*s, 37*s, 52*s, ...quillColor, 180, lw * 0.7);
  drawLine(c, 37*s, 52*s, 39*s, 51*s, ...quillColor, 180, lw * 0.7);

  // Ink dot
  drawCircle(c, 37*s, 52*s, Math.max(1, s * 1.2), ...inkColor, 130);

  return c;
}

// ── ICO file format ──
function createIco(pngBuffers) {
  // pngBuffers: array of { png: Buffer, size: number }
  const count = pngBuffers.length;
  const headerSize = 6;
  const entrySize = 16;
  const dirSize = headerSize + count * entrySize;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);      // reserved
  header.writeUInt16LE(1, 2);      // ICO type
  header.writeUInt16LE(count, 4);  // image count

  let offset = dirSize;
  const entries = [];
  for (const { png, size } of pngBuffers) {
    const entry = Buffer.alloc(entrySize);
    entry[0] = size >= 256 ? 0 : size; // width (0 = 256)
    entry[1] = size >= 256 ? 0 : size; // height
    entry[2] = 0; // palette
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4);          // color planes
    entry.writeUInt16LE(32, 6);         // bits per pixel
    entry.writeUInt32LE(png.length, 8); // data size
    entry.writeUInt32LE(offset, 12);    // data offset
    entries.push(entry);
    offset += png.length;
  }

  return Buffer.concat([header, ...entries, ...pngBuffers.map(p => p.png)]);
}

// ── Generate all sizes ──
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const sizes = [16, 32, 48, 180, 192, 512];

for (const size of sizes) {
  const canvas = drawIcon(size);
  const png = createPng(size, size, canvas.data);
  const name = size === 180 ? "apple-touch-icon.png" :
               size === 192 ? "icon-192.png" :
               size === 512 ? "icon-512.png" :
               `favicon-${size}.png`;
  fs.writeFileSync(path.join(OUT, name), png);
  console.log(`Created ${name} (${size}x${size})`);
}

// ICO with 16, 32, 48
const icoEntries = [16, 32, 48].map(size => {
  const canvas = drawIcon(size);
  return { png: createPng(size, size, canvas.data), size };
});
fs.writeFileSync(path.join(OUT, "favicon.ico"), createIco(icoEntries));
console.log("Created favicon.ico");

console.log("Done!");
