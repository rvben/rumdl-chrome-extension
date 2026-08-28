#!/usr/bin/env node

import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_PATH = join(__dirname, '..');
const SOURCE_PATH = join(PROJECT_PATH, 'store', 'screenshots');
const OUTPUT_PATH = join(PROJECT_PATH, 'store', 'listing-screenshots');

const logo = `
  <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
    <path d="M8 6h12l4 4v16c0 1.1-.9 2-2 2H8c-1.1 0-2-.9-2-2V8c0-1.1.9-2 2-2z"
      fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M20 6v4h4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="22" cy="22" r="6" fill="#8250df"/>
    <path d="M19.5 22l1.5 1.5l3-3" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

const frames = [
  {
    output: '01-feedback-before-review.png',
    source: 'after-01-warning-panel.png',
    headline: 'Markdown feedback before review comments.',
    detail: 'Open the warning panel without leaving your GitHub or GitLab editor. Jump to any issue and fix safe problems in one click.',
    meta: ['Real-time linting', 'Safe quick fixes'],
    layout: 'editor',
    focus: 'panel',
  },
  {
    output: '02-issues-beside-editor.png',
    source: 'after-02-gutter-dots.png',
    headline: 'See every issue right beside the editor.',
    detail: 'Keyboard-accessible markers make long documents easy to scan while rumdl checks your Markdown locally.',
    meta: ['Inline markers', 'Private by design'],
    layout: 'editor reverse',
    focus: 'gutter',
  },
  {
    output: '03-project-rules.png',
    source: 'after-03-popup-general.png',
    headline: 'Tune Markdown to your project.',
    detail: 'Choose your Markdown flavor, line length, formatting behavior, and editor display in one focused settings view.',
    meta: ['5 Markdown flavors', 'Automatic saving'],
    layout: 'popup',
  },
  {
    output: '04-rule-control.png',
    source: 'after-04-popup-rules.png',
    headline: '70+ rules. Searchable. Configurable.',
    detail: 'Find a rule by ID or name, then enable only the checks that belong in your workflow.',
    meta: ['Fast rule search', 'Per-rule control'],
    layout: 'popup reverse',
  },
  {
    output: '05-keyboard-workflow.png',
    source: 'after-05-popup-advanced.png',
    headline: 'Keyboard-first when you want it.',
    detail: 'Format, navigate warnings, and open quick fixes without reaching for the mouse. Settings remain portable too.',
    meta: ['Five shortcuts', 'Import and export'],
    layout: 'popup',
  },
];

function imageData(bytes) {
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

function template(frame, source) {
  const isPopup = frame.layout.includes('popup');
  const isReverse = frame.layout.includes('reverse');
  const product = isPopup
    ? `<div class="popup-stage"><img src="${source}" alt=""></div>`
    : `<div class="editor-stage ${frame.focus}">
        <div class="browser-bar"><i></i><i></i><i></i><span>github.com</span></div>
        <img class="editor-capture" src="${source}" alt="">
        ${frame.focus === 'panel' ? `<div class="panel-inset"><img src="${source}" alt=""></div>` : ''}
      </div>`;

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8">
      <style>
        * { box-sizing: border-box; }
        html, body { width: 1280px; height: 800px; margin: 0; overflow: hidden; }
        body {
          --ink: #f0f3f6;
          --muted: #aeb8c4;
          --canvas: #0d1117;
          --surface: #161b22;
          --line: #30363d;
          --purple: #a371f7;
          --blue: #58a6ff;
          color: var(--ink);
          background: var(--canvas);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        main {
          position: relative;
          display: grid;
          grid-template-columns: ${isReverse ? '760px 1fr' : '1fr 760px'};
          width: 100%;
          height: 100%;
          isolation: isolate;
        }
        main::before {
          position: absolute;
          z-index: -1;
          top: 0;
          ${isReverse ? 'left' : 'right'}: 0;
          width: 760px;
          height: 100%;
          background: ${isPopup ? '#13101c' : '#111720'};
          border-${isReverse ? 'right' : 'left'}: 1px solid var(--line);
          content: "";
        }
        .copy {
          grid-column: ${isReverse ? '2' : '1'};
          grid-row: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          min-width: 0;
          padding: ${isReverse ? '78px 64px 68px 70px' : '78px 68px 68px 72px'};
        }
        .brand {
          position: absolute;
          top: 44px;
          left: 72px;
          display: flex;
          align-items: center;
          gap: 10px;
          color: var(--ink);
          font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
          font-size: 20px;
          font-weight: 700;
          letter-spacing: -0.02em;
        }
        .brand-mark { width: 27px; height: 27px; }
        h1 {
          max-width: 470px;
          margin: 0 0 24px;
          font-size: ${isPopup ? '49px' : '51px'};
          line-height: 1.04;
          letter-spacing: -0.035em;
          text-wrap: balance;
        }
        p {
          max-width: 455px;
          margin: 0;
          color: var(--muted);
          font-size: 19px;
          line-height: 1.52;
        }
        .meta {
          display: flex;
          flex-wrap: wrap;
          gap: 9px;
          margin-top: 34px;
        }
        .meta span {
          padding: 7px 11px;
          color: #d8dee4;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 999px;
          font-size: 13px;
          font-weight: 600;
        }
        .product {
          grid-column: ${isReverse ? '1' : '2'};
          grid-row: 1;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 0;
          padding: 58px 48px;
        }
        .product::after {
          position: absolute;
          z-index: -1;
          width: 420px;
          height: 420px;
          border: 1px solid ${isPopup ? '#3b2b57' : '#293446'};
          border-radius: 50%;
          content: "";
        }
        .editor-stage {
          position: relative;
          width: 690px;
          height: 548px;
          overflow: hidden;
          background: #f6f8fa;
          border-radius: 14px;
          box-shadow: 0 28px 70px rgba(0, 0, 0, 0.38);
        }
        .browser-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          height: 42px;
          padding: 0 15px;
          color: #8c959f;
          background: #161b22;
          border-bottom: 1px solid #30363d;
          font-size: 12px;
        }
        .browser-bar i { width: 10px; height: 10px; border-radius: 50%; background: #484f58; }
        .browser-bar i:first-child { background: #f85149; }
        .browser-bar i:nth-child(2) { background: #d29922; }
        .browser-bar i:nth-child(3) { background: #3fb950; margin-right: 8px; }
        .editor-capture {
          display: block;
          width: 1000px;
          height: auto;
        }
        .editor-stage.panel .editor-capture { transform: translateX(-26px); }
        .editor-stage.gutter .editor-capture { transform: translateX(-20px); }
        .panel-inset {
          position: absolute;
          top: 112px;
          right: 18px;
          width: 342px;
          height: 292px;
          overflow: hidden;
          background: #0d1117;
          border: 1px solid #30363d;
          border-radius: 10px;
          box-shadow: 0 18px 44px rgba(0, 0, 0, 0.38);
        }
        .panel-inset img {
          position: absolute;
          top: -138px;
          left: -898px;
          display: block;
          width: 1280px;
          height: 800px;
          max-width: none;
        }
        .popup-stage {
          position: relative;
          width: 414px;
          height: 594px;
          padding: 16px;
          background: #010409;
          border: 1px solid #30363d;
          border-radius: 16px;
          box-shadow: 0 28px 70px rgba(0, 0, 0, 0.44);
        }
        .popup-stage::before {
          position: absolute;
          top: 7px;
          left: 50%;
          width: 42px;
          height: 4px;
          background: #30363d;
          border-radius: 2px;
          content: "";
          transform: translateX(-50%);
        }
        .popup-stage img { display: block; width: 380px; height: 560px; border-radius: 5px; }
        .accent-line {
          position: absolute;
          right: ${isReverse ? 'auto' : '0'};
          bottom: 0;
          left: ${isReverse ? '0' : 'auto'};
          width: 176px;
          height: 6px;
          background: var(--purple);
        }
      </style>
    </head>
    <body>
      <main>
        <div class="brand">${logo}<span>rumdl</span></div>
        <section class="copy">
          <h1>${frame.headline}</h1>
          <p>${frame.detail}</p>
          <div class="meta">${frame.meta.map(item => `<span>${item}</span>`).join('')}</div>
        </section>
        <section class="product">${product}</section>
        <div class="accent-line"></div>
      </main>
    </body>
  </html>`;
}

async function render() {
  await mkdir(OUTPUT_PATH, { recursive: true });
  const browser = await chromium.launch({ channel: 'chromium', headless: true });

  try {
    for (const frame of frames) {
      const source = imageData(await readFile(join(SOURCE_PATH, frame.source)));
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.setContent(template(frame, source), { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(OUTPUT_PATH, frame.output) });
      await page.close();
      console.log(`Rendered ${frame.output}`);
    }
  } finally {
    await browser.close();
  }
}

await render();
