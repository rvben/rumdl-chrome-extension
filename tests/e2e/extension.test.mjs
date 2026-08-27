import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer } from './server.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_PATH = join(__dirname, '..', '..');
const DEFAULT_CONFIG = {
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

let context;
let extensionPath;
let server;
let serviceWorker;
let extensionId;

async function prepareTestExtension() {
  extensionPath = await mkdtemp(join(tmpdir(), 'rumdl-extension-e2e-'));
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

async function setup() {
  server = await startServer();
  await prepareTestExtension();

  context = await chromium.launchPersistentContext(join(extensionPath, 'profile'), {
    channel: 'chromium',
    headless: process.env.HEADED !== '1',
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  serviceWorker = context.serviceWorkers()[0]
    ?? await context.waitForEvent('serviceworker');
  extensionId = new URL(serviceWorker.url()).host;
}

async function teardown() {
  await context?.close();
  await new Promise(resolve => server?.server.close(resolve));
  if (extensionPath) {
    await rm(extensionPath, { recursive: true, force: true });
  }
}

async function setConfig(overrides = {}) {
  const config = { ...DEFAULT_CONFIG, ...overrides };
  await serviceWorker.evaluate(async value => {
    await chrome.storage.sync.set({ rumdl_config: value });
  }, config);
}

async function loadPage(fixture, config = {}) {
  await setConfig(config);
  const page = await context.newPage();
  await page.goto(`${server.url}/${fixture}`, { waitUntil: 'domcontentloaded' });
  await page.locator('textarea[data-rumdl-managed="true"]').waitFor();
  return page;
}

async function testEditorDetection() {
  for (const [fixture, selector] of [
    ['github-mock.html', 'textarea[aria-label="Markdown value"]'],
    ['gitlab-mock.html', 'textarea.note-textarea'],
  ]) {
    const page = await loadPage(fixture);
    const managed = await page.locator(selector).getAttribute('data-rumdl-managed');
    assert.equal(managed, 'true');
    await page.close();
  }
}

async function testRealLintResults() {
  const page = await loadPage('github-mock.html');
  await page.locator('textarea').fill('# Duplicate\n\n# Duplicate\n');
  await page.locator('.rumdl-gutter-marker').first().waitFor();

  const count = await page.locator('.rumdl-status-count').textContent();
  assert.notEqual(count, '0', 'status button should report actual lint warnings');
  await page.close();
}

async function testPanelVisibilityState() {
  const page = await loadPage('github-mock.html');
  await page.locator('textarea').fill('# Duplicate\n\n# Duplicate\n');
  await page.locator('.rumdl-gutter-marker').first().waitFor();
  const statusButton = page.locator('.rumdl-status-btn');
  await statusButton.click();
  const panel = page.locator('.rumdl-panel');
  await panel.locator('.rumdl-warning-jump').first().waitFor();

  assert.equal(await panel.getAttribute('aria-hidden'), 'false');
  assert.equal(await panel.getAttribute('inert'), null);
  assert.equal(await statusButton.getAttribute('aria-expanded'), 'true');

  const warningButton = panel.locator('.rumdl-warning-jump').first();
  await warningButton.focus();
  await warningButton.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'TEXTAREA');
  assert.equal(await warningButton.getAttribute('aria-current'), 'true');

  const panelBox = await panel.boundingBox();
  assert.ok(panelBox, 'visible panel should have a bounding box');

  await page.locator('.rumdl-btn-close').click();
  assert.equal(await panel.getAttribute('aria-hidden'), 'true');
  assert.notEqual(await panel.getAttribute('inert'), null);
  assert.equal(await statusButton.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('rumdl-status-btn')), true);

  const hiddenHitTarget = await page.evaluate(({ x, y }) => {
    const target = document.elementFromPoint(x, y);
    return Boolean(target?.closest('.rumdl-panel'));
  }, { x: panelBox.x + panelBox.width / 2, y: panelBox.y + panelBox.height / 2 });
  assert.equal(hiddenHitTarget, false, 'hidden panel must not block the page');
  await page.close();
}

async function testPanelFitsNarrowViewport() {
  const page = await loadPage('github-mock.html');
  await page.setViewportSize({ width: 320, height: 480 });
  await page.locator('textarea').fill('# Duplicate\n\n# Duplicate\n');
  await page.locator('.rumdl-gutter-marker').first().waitFor();
  await page.locator('.rumdl-status-btn').click();
  const panel = page.locator('.rumdl-panel.visible');
  await panel.waitFor();

  const bounds = await panel.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });
  assert.ok(bounds.left >= 0 && bounds.right <= bounds.viewportWidth, 'panel should fit horizontally');
  assert.ok(bounds.top >= 0 && bounds.bottom <= bounds.viewportHeight, 'panel should fit vertically');
  await page.close();
}

async function testPopupKeyboardAndRules() {
  await setConfig();
  const page = await context.newPage();
  await page.setViewportSize({ width: 380, height: 560 });
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

  const generalTab = page.getByRole('tab', { name: 'General' });
  const rulesTab = page.getByRole('tab', { name: 'Rules' });
  await generalTab.waitFor();
  await generalTab.focus();
  await generalTab.press('ArrowRight');
  assert.equal(await rulesTab.getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#tab-rules').isVisible(), true);

  const search = page.getByRole('searchbox', { name: 'Search rules' });
  await page.locator('.rule-item').first().waitFor();
  await search.fill('MD013');
  const visibleRuleNames = await page.locator('.rule-item .rule-name').allTextContents();
  assert.ok(visibleRuleNames.length > 0, 'rule search should return MD013');
  assert.ok(visibleRuleNames.every(name => name.includes('MD013')));

  await rulesTab.press('Home');
  assert.equal(await generalTab.getAttribute('aria-selected'), 'true');
  const lineLength = page.getByRole('spinbutton', { name: 'Line length' });
  await lineLength.fill('39');
  await lineLength.press('Tab');
  assert.equal(await lineLength.getAttribute('aria-invalid'), 'true');
  assert.match(await page.locator('#lineLengthError').textContent(), /40 to 500/);

  await lineLength.fill('100');
  await lineLength.press('Tab');
  await page.locator('#saveStatus').filter({ hasText: 'All changes saved' }).waitFor();
  const savedLineLength = await serviceWorker.evaluate(async () => {
    const result = await chrome.storage.sync.get('rumdl_config');
    return result.rumdl_config.lineLength;
  });
  assert.equal(savedLineLength, 100);
  await page.close();
}

async function testRuntimeEnableToggle() {
  await setConfig({ enabled: false });
  const page = await context.newPage();
  await page.goto(`${server.url}/gitlab-mock.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(750);
  assert.equal(await page.locator('textarea[data-rumdl-managed="true"]').count(), 0);

  await setConfig({ enabled: true });
  await page.locator('textarea[data-rumdl-managed="true"]').waitFor();

  await setConfig({ enabled: false });
  await page.locator('textarea[data-rumdl-managed="true"]').waitFor({ state: 'detached' });
  assert.equal(await page.locator('.rumdl-gutter').count(), 0);

  await setConfig({ enabled: true });
  await page.locator('textarea[data-rumdl-managed="true"]').waitFor();
  await page.close();
}

async function testRuntimeGutterToggle() {
  const page = await loadPage('github-mock.html', { showGutterIcons: false });
  assert.equal(await page.locator('.rumdl-gutter').count(), 0);

  await setConfig({ showGutterIcons: true });
  await page.locator('.rumdl-gutter').waitFor();

  await setConfig({ showGutterIcons: false });
  await page.locator('.rumdl-gutter').waitFor({ state: 'detached' });
  await page.close();
}

const tests = [
  ['GitHub and GitLab editors are detected', testEditorDetection],
  ['linting returns and renders real warnings', testRealLintResults],
  ['panel is keyboard-operable, inert when hidden, and restores focus', testPanelVisibilityState],
  ['panel stays inside a narrow viewport', testPanelFitsNarrowViewport],
  ['popup tabs, rules search, validation, and saving work', testPopupKeyboardAndRules],
  ['enable setting updates the active page', testRuntimeEnableToggle],
  ['gutter setting updates the active page', testRuntimeGutterToggle],
];

async function run() {
  console.log('rumdl Chrome Extension E2E Tests');
  console.log('================================');

  try {
    await setup();
    for (const [name, test] of tests) {
      await test();
      console.log(`  PASS: ${name}`);
    }
    console.log(`\nAll E2E tests passed! (${tests.length}/${tests.length})`);
  } catch (error) {
    console.error(`\nTest failed: ${error.stack ?? error.message}`);
    process.exitCode = 1;
  } finally {
    await teardown();
  }
}

await run();
