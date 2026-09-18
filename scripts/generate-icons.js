#!/usr/bin/env node
// Render the production rumdl small-size mark with the project's browser tooling.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
const icons = new URL('../icons/', import.meta.url);
const source = readFileSync(new URL('icon.svg', icons), 'utf8');
const browser = await chromium.launch();
try {
  for (const size of [16, 32, 48, 128]) {
    const svg = source.replace('viewBox="0 0 64 64"', `width="${size}" height="${size}" viewBox="0 0 64 64"`);
    writeFileSync(new URL(`icon-${size}.svg`, icons), svg);
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
    await page.screenshot({ path: new URL(`icon-${size}.png`, icons).pathname, omitBackground: true });
    await page.close();
    console.log(`Generated Heading Pulse icon: ${size}px`);
  }
} finally { await browser.close(); }
