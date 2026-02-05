#!/usr/bin/env node

// Generate simple PNG icons for the Chrome extension
// These are basic icons - replace with proper ones for production

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '..', 'icons');

// Ensure icons directory exists
if (!existsSync(iconsDir)) {
  mkdirSync(iconsDir, { recursive: true });
}

// Simple SVG icon (a stylized "R" for rumdl)
function createSvgIcon(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#89b4fa;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#cba6f7;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * 0.15}" fill="url(#grad)"/>
  <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle"
        font-family="ui-monospace, SFMono-Regular, monospace"
        font-weight="bold"
        font-size="${size * 0.5}px"
        fill="#1e1e2e">R</text>
</svg>`;
}

// Create SVG files (we'll need to convert to PNG manually or use a tool)
const sizes = [16, 32, 48, 128];

for (const size of sizes) {
  const svg = createSvgIcon(size);
  const filename = `icon-${size}.svg`;
  writeFileSync(join(iconsDir, filename), svg);
  console.log(`Created: ${filename}`);
}

console.log('\nNote: SVG icons created. For Chrome Web Store, convert to PNG.');
console.log('You can use tools like Inkscape or online converters.');
console.log('\nFor development, Chrome will work with SVG icons if you update manifest.json');
