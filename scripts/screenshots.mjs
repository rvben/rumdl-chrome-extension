#!/usr/bin/env node

import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer } from '../tests/e2e/server.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_PATH = join(__dirname, '..');
const configuredScreenshotsDir = process.env.SCREENSHOTS_DIR;
const screenshotPrefix = process.env.SCREENSHOT_PREFIX ?? '';
const SCREENSHOTS_DIR = configuredScreenshotsDir
  ? (isAbsolute(configuredScreenshotsDir)
      ? configuredScreenshotsDir
      : join(process.cwd(), configuredScreenshotsDir))
  : join(PROJECT_PATH, 'store', 'screenshots');
const screenshotPath = name => join(SCREENSHOTS_DIR, `${screenshotPrefix}${name}`);

const CONFIG = {
  enabled: true,
  flavor: 'standard',
  lineLength: 80,
  disabledRules: ['MD041'],
  enabledRules: [],
  ruleConfigs: {},
  autoFormat: false,
  showGutterIcons: true,
  reflow: false,
};

const SAMPLE_MARKDOWN = `# Bug report

## Steps to reproduce

Open the settings panel and click save.
The configuration is not persisted.

## Expected behavior

Settings should be saved automatically.

## Actual behavior

This intentionally long line exceeds the configured line length so the real rumdl WebAssembly linter produces a useful warning for visual review.

-  Step one
-   Step two

## Fix suggestion

Use localStorage to persist settings.
`;

let context;
let extensionPath;
let server;

async function prepareExtension() {
  extensionPath = await mkdtemp(join(tmpdir(), 'rumdl-visual-review-'));
  await Promise.all([
    cp(join(PROJECT_PATH, 'dist'), join(extensionPath, 'dist'), { recursive: true }),
    cp(join(PROJECT_PATH, 'icons'), join(extensionPath, 'icons'), { recursive: true }),
    cp(join(PROJECT_PATH, 'popup'), join(extensionPath, 'popup'), { recursive: true }),
  ]);

  const manifest = JSON.parse(await readFile(join(PROJECT_PATH, 'manifest.json'), 'utf8'));
  const testOrigin = 'http://127.0.0.1/*';
  manifest.host_permissions = [...manifest.host_permissions, testOrigin];
  manifest.content_scripts[0].matches = [testOrigin];
  manifest.web_accessible_resources[0].matches = [testOrigin];
  await writeFile(
    join(extensionPath, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
}

async function captureScreenshots() {
  await mkdir(SCREENSHOTS_DIR, { recursive: true });
  await prepareExtension();
  server = await startServer();

  context = await chromium.launchPersistentContext(join(extensionPath, 'profile'), {
    channel: 'chromium',
    headless: process.env.HEADED !== '1',
    viewport: { width: 1280, height: 800 },
    colorScheme: 'dark',
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  const serviceWorker = context.serviceWorkers()[0]
    ?? await context.waitForEvent('serviceworker');
  const extensionId = new URL(serviceWorker.url()).host;

  await serviceWorker.evaluate(async config => {
    await chrome.storage.sync.set({ rumdl_config: config });
  }, CONFIG);

  const editorPage = await context.newPage();
  await editorPage.goto(`${server.url}/github-mock.html`, { waitUntil: 'domcontentloaded' });
  await editorPage.locator('textarea[data-rumdl-managed="true"]').waitFor();
  await editorPage.locator('textarea').fill(SAMPLE_MARKDOWN);
  await editorPage.locator('.rumdl-gutter > *').first().waitFor();

  await editorPage.screenshot({
    path: screenshotPath('02-gutter-dots.png'),
    fullPage: true,
  });

  await editorPage.locator('.rumdl-status-btn').click();
  await editorPage.locator('.rumdl-panel.visible').waitFor();
  await editorPage.screenshot({
    path: screenshotPath('01-warning-panel.png'),
    fullPage: true,
  });

  const popupPage = await context.newPage();
  await popupPage.setViewportSize({ width: 380, height: 560 });
  await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await popupPage.locator('#settingsShell').waitFor({ state: 'visible' });
  await popupPage.locator('#rulesList[aria-busy="false"]').waitFor({ state: 'attached' });
  await popupPage.screenshot({
    path: screenshotPath('03-popup-general.png'),
    fullPage: true,
  });

  await popupPage.getByRole('tab', { name: 'Rules' }).click();
  await popupPage.locator('.rule-item').first().waitFor();
  await popupPage.screenshot({
    path: screenshotPath('04-popup-rules.png'),
    fullPage: true,
  });

  console.log(`Captured visual review screenshots in ${SCREENSHOTS_DIR}`);
}

try {
  await captureScreenshots();
} finally {
  await context?.close();
  await new Promise(resolve => server?.server.close(resolve));
  if (extensionPath) {
    await rm(extensionPath, { recursive: true, force: true });
  }
}
