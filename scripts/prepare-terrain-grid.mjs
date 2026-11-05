import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/prepare-terrain-grid.mjs <WorldPop export.tif>');
const bytes = fs.readFileSync(input);
if (bytes.toString('ascii', 0, 2) !== 'II' || bytes.readUInt16LE(2) !== 42) throw new Error('Expected little-endian TIFF');
const offset = bytes.readUInt32LE(4), fields = new Map();
for (let i = 0; i < bytes.readUInt16LE(offset); i++) {
  const p = offset + 2 + i * 12;
  fields.set(bytes.readUInt16LE(p), { type: bytes.readUInt16LE(p + 2), count: bytes.readUInt32LE(p + 4), value: bytes.readUInt32LE(p + 8) });
}
const scalar = tag => fields.get(tag)?.value;
if (scalar(256) !== 720 || scalar(257) !== 360 || scalar(258) !== 32 || scalar(259) !== 1 || scalar(277) !== 1 || scalar(339) !== 3) throw new Error('Expected uncompressed 720 × 360 single-band Float32 export');
const scale = fields.get(33550), tie = fields.get(33922);
if (bytes.readDoubleLE(scale.value) !== .5 || bytes.readDoubleLE(scale.value + 8) !== .5 || bytes.readDoubleLE(tie.value + 24) !== -180 || bytes.readDoubleLE(tie.value + 32) !== 90) throw new Error('Unexpected geographic extent or resolution');
const width = 720, height = 360, tileWidth = scalar(322), tileHeight = scalar(323), offsets = fields.get(324);
const output = Buffer.alloc(width * height * 4);
let valid = 0, zeros = 0;
for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
  const tile = Math.floor(row / tileHeight) * Math.ceil(width / tileWidth) + Math.floor(col / tileWidth);
  const address = bytes.readUInt32LE(offsets.value + tile * 4) + ((row % tileHeight) * tileWidth + col % tileWidth) * 4;
  const value = bytes.readFloatLE(address);
  const present = Number.isFinite(value) && value >= 0 && value !== Math.fround(3.4e38);
  if (present) { valid++; if (value === 0) zeros++; }
  output.writeFloatLE(present ? value : NaN, (row * width + col) * 4);
}
const directory = fileURLToPath(new URL('../src/data/', import.meta.url));
fs.writeFileSync(directory + 'worldpop-grid-2020.bin', output);
const metadata = { year: 2020, width, height, stepDegrees: .5, west: -180, north: 90, unit: 'people/km²', source: 'WorldPop / CIESIN', sourceUrl: 'https://doi.org/10.5258/SOTON/WP00674', license: 'https://creativecommons.org/licenses/by/4.0/', valid, zeros, missing: width * height - valid, encoding: 'Float32 little-endian, row-major north to south; NaN means NoData; pixel-center samples', sampling: 'Nearest-neighbor samples every 0.5° from the 30 arc-second WorldPop density raster, requested for 2020-01-01 UTC. Not area averages.', inputSha256: crypto.createHash('sha256').update(bytes).digest('hex') };
fs.writeFileSync(directory + 'worldpop-grid-2020.json', JSON.stringify(metadata, null, 2) + '\n');
console.log(JSON.stringify(metadata));
