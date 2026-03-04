#!/usr/bin/env node

// Screenshot automation for Chrome Web Store listing
// Captures the extension in action on a mock GitHub page
//
// Usage: node scripts/screenshots.mjs
// Requires: puppeteer (npm install puppeteer)

import puppeteer from 'puppeteer';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SCREENSHOTS_DIR = join(ROOT, 'store', 'screenshots');
const FIXTURES_DIR = join(ROOT, 'tests', 'e2e', 'fixtures');

// Markdown with intentional lint issues for screenshots
const SAMPLE_MARKDOWN = `# My Project

##Setup Instructions
This is a guide for setting up the project.Follow these steps:

- Install dependencies
- Run the build
- Deploy to production

1.  First step
2.  Second step

### Configuration
Set the following environment variables:
- \`API_KEY\` - your API key
- \`DB_HOST\` - database host

This is a long line that exceeds the default line length limit and should trigger a warning from the linter about keeping lines short for readability.
`;

async function captureScreenshots() {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  // Start a simple server for fixtures
  const { createServer } = await import('http');
  const { readFileSync } = await import('fs');

  const server = createServer((req, res) => {
    const filePath = join(FIXTURES_DIR, 'github-mock.html');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(readFileSync(filePath));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}`;

  console.log(`Server running at ${url}`);

  const browser = await puppeteer.launch({
    headless: false,  // Need visible browser for extension screenshots
    args: [
      `--disable-extensions-except=${ROOT}`,
      `--load-extension=${ROOT}`,
      '--no-sandbox',
      '--window-size=1280,900',
    ],
    defaultViewport: { width: 1280, height: 900 },
  });

  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Wait for extension to initialize
    await page.waitForTimeout(3000);

    // Type markdown with issues
    await page.type('textarea', SAMPLE_MARKDOWN, { delay: 10 });
    await page.waitForTimeout(1000);

    // Screenshot 1: Gutter dots visible
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, '1-gutter-dots.png'),
      clip: { x: 0, y: 0, width: 1280, height: 900 },
    });
    console.log('Captured: 1-gutter-dots.png');

    // Screenshot 2: Warning panel (Cmd+Shift+L)
    await page.keyboard.down('Meta');
    await page.keyboard.down('Shift');
    await page.keyboard.press('KeyL');
    await page.keyboard.up('Shift');
    await page.keyboard.up('Meta');
    await page.waitForTimeout(500);

    await page.screenshot({
      path: join(SCREENSHOTS_DIR, '2-warning-panel.png'),
      clip: { x: 0, y: 0, width: 1280, height: 900 },
    });
    console.log('Captured: 2-warning-panel.png');

    // Screenshot 3: Popup settings
    // Note: Popup screenshots require manual capture since Puppeteer
    // can't easily open extension popups. Print instructions instead.
    console.log('\nNote: Popup screenshot must be captured manually:');
    console.log('  1. Click the rumdl extension icon in Chrome toolbar');
    console.log('  2. Take a screenshot of the popup');
    console.log(`  3. Save to ${join(SCREENSHOTS_DIR, '3-popup-settings.png')}`);

    console.log('\nScreenshots saved to store/screenshots/');
  } finally {
    await browser.close();
    server.close();
  }
}

captureScreenshots().catch(console.error);
