#!/usr/bin/env node

import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const PROJECT_PATH = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_PATH = join(PROJECT_PATH, 'store', 'screenshots');
const OUTPUT_PATH = join(PROJECT_PATH, 'store', 'listing-screenshots');
const frames = [
  {
    output: '01-feedback-before-review.png', source: 'dark-01-warning-panel.png',
    headline: 'Catch Markdown issues as you write.',
    detail: 'See warnings, jump to the relevant line, and apply safe fixes inside your GitHub or GitLab editor.',
    layout: 'editor', theme: 'dark',
  },
  {
    output: '02-issues-beside-editor.png', source: 'light-02-gutter-dots.png',
    headline: 'Every warning. On the right line.',
    detail: 'Line numbers and warning markers keep feedback beside your Markdown. The interface follows your site’s light or dark theme.',
    layout: 'editor', theme: 'light',
  },
  {
    output: '03-project-rules.png', source: 'light-03-popup-general.png',
    headline: 'Your Markdown. Your preferences.',
    detail: 'Choose a Markdown flavor, set your line length, and control editor feedback. Changes save automatically.',
    layout: 'popup', theme: 'light',
  },
  {
    output: '04-rule-control.png', source: 'dark-04-popup-rules.png',
    headline: 'Find the rules that fit your project.',
    detail: 'Search by rule ID or name and choose the checks you need. Linting runs locally in your browser.',
    layout: 'popup', theme: 'dark',
  },
  {
    output: '05-keyboard-workflow.png', source: 'dark-05-popup-advanced.png',
    headline: 'Keep your hands on the keyboard.',
    detail: 'Navigate warnings and apply fixes with shortcuts. Export your settings to use the same setup elsewhere.',
    layout: 'popup', theme: 'dark',
  },
];

function data(bytes, mime) {
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

function template(frame, source, logo) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 1280px; height: 800px; overflow: hidden; }
    body { color: ${frame.theme === 'light' ? '#181a1d' : '#f7f2f0'};
      background: ${frame.theme === 'light' ? '#f8f5f2' : '#1b181c'};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased; }
    main { display: grid; grid-template-columns: 440px 1fr; height: 100%; }
    .copy { display: flex; flex-direction: column; justify-content: center; padding: 130px 24px 96px 56px; }
    .brand { position: absolute; left: 56px; top: 48px; width: 156px; height: 37px; }
    h1 { margin: 0 0 28px; font-size: 44px; font-weight: 650; line-height: 1.1; letter-spacing: -0.03em; text-wrap: balance; }
    p { margin: 0; font-size: 20px; line-height: 1.55; color: ${frame.theme === 'light' ? '#59515a' : '#c4bac5'}; }
    .product { display: flex; align-items: center; justify-content: center; padding: 48px 48px 48px 24px; }
    .capture { display: block; width: ${frame.layout === 'editor' ? '720px' : '400px'}; height: auto;
      border-radius: 12px; box-shadow: 0 16px 48px ${frame.theme === 'light' ? 'rgba(31, 25, 30, .14)' : 'rgba(0, 0, 0, .32)'}; }
    footer { position: absolute; left: 56px; bottom: 48px; font-size: 15px; color: ${frame.theme === 'light' ? '#59515a' : '#c4bac5'}; }
  </style></head><body><main>
    <img class="brand" src="${logo}" alt="rumdl">
    <section class="copy"><h1>${frame.headline}</h1><p>${frame.detail}</p></section>
    <section class="product"><img class="capture" src="${source}" alt="rumdl ${frame.layout} in ${frame.theme} mode"></section>
    <footer>Markdown linting for GitHub &amp; GitLab</footer>
  </main></body></html>`;
}

async function render() {
  await mkdir(OUTPUT_PATH, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const frame of frames) {
      const source = data(await readFile(join(SOURCE_PATH, frame.source)), 'image/png');
      const logo = data(await readFile(join(PROJECT_PATH, 'popup', frame.theme === 'dark' ? 'logo-dark.svg' : 'logo.svg')), 'image/svg+xml');
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
      await page.setContent(template(frame, source, logo), { waitUntil: 'load' });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map(image => image.decode()));
        for (const element of document.querySelectorAll('.brand, .copy, .capture, footer')) {
          const rect = element.getBoundingClientRect();
          if (rect.left < 0 || rect.top < 0 || rect.right > 1280 || rect.bottom > 800) throw new Error('Listing element exceeds image bounds');
        }
      });
      await page.screenshot({ path: join(OUTPUT_PATH, frame.output) });
      await page.close();
      console.log(`Rendered ${frame.output}`);
    }
  } finally {
    await browser.close();
  }
}

await render();
