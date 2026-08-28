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
const captureReadinessVariants = process.env.SCREENSHOT_READINESS_VARIANTS === '1';
const screenshotColorScheme = process.env.SCREENSHOT_COLOR_SCHEME === 'light' ? 'light' : 'dark';
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
    colorScheme: screenshotColorScheme,
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
  await serviceWorker.evaluate(async editorUrl => {
    const tabs = await chrome.tabs.query({});
    const editorTab = tabs.find(tab => tab.url === editorUrl);
    if (!editorTab?.id) throw new Error('Could not activate the visual-review editor tab');
    await chrome.tabs.update(editorTab.id, { active: true });
  }, editorPage.url());
  await popupPage.reload();
  await popupPage.locator('#settingsShell').waitFor({ state: 'visible' });
  await popupPage.locator('#rulesList[aria-busy="false"]').waitFor({ state: 'attached' });
  // The visual fixture runs on 127.0.0.1, while production readiness is
  // intentionally limited to github.com and gitlab.com. Render the equivalent
  // live-editor state after the real content-script fixture is confirmed above.
  await popupPage.evaluate(() => {
    document.querySelector('#pageReadiness').dataset.tone = 'ready';
    document.querySelector('#pageReadinessTitle').textContent = 'Ready on this page';
    document.querySelector('#pageReadinessDescription').textContent = '1 Markdown editor detected.';
  });
  await popupPage.locator('#pageReadiness[data-tone="ready"]').waitFor({ state: 'attached' });
  await popupPage.screenshot({
    path: screenshotPath('03-popup-general.png'),
    fullPage: true,
  });

  if (captureReadinessVariants) {
    const variants = [
      ['ready', 'Ready on this page', '1 Markdown editor detected.'],
      ['idle', 'Ready when the editor opens', 'Open a Markdown editor on this page.'],
      ['attention', 'Reload this tab to activate rumdl', 'The page was open before rumdl loaded.'],
      ['paused', 'rumdl is paused', 'Turn it on to lint Markdown editors.'],
      ['error', 'Linting is temporarily unavailable', 'Type in the editor to retry, or reload the tab.'],
    ];
    for (const [tone, title, description] of variants) {
      await popupPage.evaluate(({ stateTone, stateTitle, stateDescription }) => {
        document.querySelector('#pageReadiness').dataset.tone = stateTone;
        document.querySelector('#pageReadinessTitle').textContent = stateTitle;
        document.querySelector('#pageReadinessDescription').textContent = stateDescription;
        document.querySelector('#enabled').checked = stateTone !== 'paused';
      }, { stateTone: tone, stateTitle: title, stateDescription: description });
      await popupPage.waitForTimeout(200);
      await popupPage.screenshot({
        path: screenshotPath(`readiness-${tone}.png`),
        fullPage: true,
      });
    }
    await popupPage.evaluate(() => {
      document.querySelector('#pageReadiness').dataset.tone = 'ready';
      document.querySelector('#pageReadinessTitle').textContent = 'Ready on this page';
      document.querySelector('#pageReadinessDescription').textContent = '1 Markdown editor detected.';
      document.querySelector('#enabled').checked = true;
    });
    await popupPage.waitForTimeout(200);
  }

  await popupPage.getByRole('tab', { name: 'Rules' }).click();
  await popupPage.locator('.rule-item').first().waitFor();
  await popupPage.screenshot({
    path: screenshotPath('04-popup-rules.png'),
    fullPage: true,
  });

  await popupPage.getByRole('tab', { name: 'Advanced' }).click();
  await popupPage.locator('#tab-advanced').waitFor({ state: 'visible' });
  await popupPage.screenshot({
    path: screenshotPath('05-popup-advanced.png'),
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
