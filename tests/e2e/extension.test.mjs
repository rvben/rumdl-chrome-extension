import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
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
const LARGE_DOCUMENT_MAX_WALL_TIME_MS = 2500;

let context;
let extensionPath;
let server;
let serviceWorker;
let extensionId;
let extensionControlPage;

async function prepareTestExtension() {
  extensionPath = await mkdtemp(join(tmpdir(), 'rumdl-extension-e2e-'));
  const storeSource = process.env.E2E_EXTENSION_SOURCE
    ? resolve(process.env.E2E_EXTENSION_SOURCE)
    : null;

  if (storeSource) {
    await cp(storeSource, extensionPath, { recursive: true });
  } else {
    await Promise.all([
      cp(join(PROJECT_PATH, 'dist'), join(extensionPath, 'dist'), { recursive: true }),
      cp(join(PROJECT_PATH, 'icons'), join(extensionPath, 'icons'), { recursive: true }),
      cp(join(PROJECT_PATH, 'popup'), join(extensionPath, 'popup'), { recursive: true }),
      cp(join(PROJECT_PATH, 'manifest.json'), join(extensionPath, 'manifest.json')),
    ]);
  }

  const manifestPath = join(extensionPath, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const testOrigin = 'http://127.0.0.1/*';
  manifest.host_permissions = [...new Set([...(manifest.host_permissions || []), testOrigin])];
  manifest.content_scripts[0].matches = [testOrigin];
  manifest.web_accessible_resources[0].matches = [testOrigin];
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  const sourceLabel = process.env.E2E_EXTENSION_LABEL
    || (storeSource ? 'provided package' : 'local build');
  console.log(`Testing extension v${manifest.version} from ${sourceLabel}`);
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
  extensionControlPage = await context.newPage();
  await extensionControlPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
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
  await extensionControlPage.evaluate(async value => {
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

async function testPageStatusMessaging() {
  const page = await loadPage('github-mock.html');
  const status = await extensionControlPage.evaluate(async pageUrl => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find(candidate => candidate.url === pageUrl);
    if (!tab?.id) throw new Error('Could not find the editor tab');
    return chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_STATUS' });
  }, page.url());

  assert.equal(status.type, 'PAGE_STATUS_RESULT');
  assert.equal(status.status.editorCount, 1);
  assert.equal(status.status.enabled, true);
  assert.equal(status.status.serviceWorkerHealthy, true);
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
  const savedLineLength = await extensionControlPage.evaluate(async () => {
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

async function testServiceWorkerRecovery() {
  const page = await loadPage('github-mock.html');
  const cdp = await context.newCDPSession(page);
  const workerScriptUrl = `chrome-extension://${extensionId}/dist/background/service-worker.js`;
  const workerVersionPromise = new Promise((resolveVersion, rejectVersion) => {
    const timeout = setTimeout(() => {
      cdp.removeListener('ServiceWorker.workerVersionUpdated', handleVersions);
      rejectVersion(new Error('Timed out waiting for the extension worker version'));
    }, 5000);
    const handleVersions = ({ versions }) => {
      const version = versions.find(candidate => candidate.scriptURL === workerScriptUrl);
      if (!version) return;
      clearTimeout(timeout);
      cdp.removeListener('ServiceWorker.workerVersionUpdated', handleVersions);
      resolveVersion(version);
    };
    cdp.on('ServiceWorker.workerVersionUpdated', handleVersions);
  });
  await cdp.send('ServiceWorker.enable');
  const workerVersion = await workerVersionPromise;

  await cdp.send('ServiceWorker.stopWorker', { versionId: workerVersion.versionId });
  await page.locator('textarea').fill('# Duplicate\n\n# Duplicate\n');
  await page.locator('.rumdl-status-btn.has-error').waitFor({ timeout: 5000 });
  await page.locator('textarea').fill('# Duplicate\n\n# Duplicate\n\nTrailing text\n');
  await page.locator('.rumdl-gutter-marker').first().waitFor({ timeout: 5000 });

  assert.notEqual(await page.locator('.rumdl-status-count').textContent(), '0');
  await cdp.send('ServiceWorker.disable');
  await cdp.detach();
  await page.close();
}

async function testLatestLintResultWins() {
  const page = await loadPage('github-mock.html', { showGutterIcons: false });
  const result = await page.evaluate(async () => {
    const textarea = document.querySelector('textarea');
    const count = document.querySelector('.rumdl-status-count');
    if (!textarea || !count) throw new Error('Lint editor UI is unavailable');

    const staleCounts = [];
    textarea.value = `${'# Duplicate\n\n'.repeat(5000)}Trailing text\n`;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    await new Promise(resolve => setTimeout(resolve, 155));
    const observer = new MutationObserver(() => {
      if (count.textContent !== '0') staleCounts.push(count.textContent);
    });
    observer.observe(count, { childList: true, subtree: true, characterData: true });

    textarea.value = '# Clean document\n';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 750));
    observer.disconnect();

    return { finalCount: count.textContent, staleCounts };
  });

  assert.equal(result.finalCount, '0', 'the final editor content should have no warnings');
  assert.deepEqual(result.staleCounts, [], 'an older lint result must not replace the latest result');
  await page.close();
}

async function testLargeDocumentPerformance() {
  const page = await loadPage('github-mock.html', { showGutterIcons: false });
  const markdown = Array.from(
    { length: 1200 },
    (_, index) => `Paragraph ${index}: ${'word '.repeat(24)}`,
  ).join('\n\n');

  const wallTimeMs = await page.evaluate(async ({ content, budgetMs }) => {
    const textarea = document.querySelector('textarea');
    const button = document.querySelector('.rumdl-status-btn');
    const time = document.querySelector('.rumdl-status-time');
    if (!textarea || !button || !time) throw new Error('Lint editor UI is unavailable');

    return new Promise((resolveTime, rejectTime) => {
      const startedAt = performance.now();
      let sawLinting = false;
      const timeout = setTimeout(() => {
        observer.disconnect();
        rejectTime(new Error(`Large-document linting exceeded ${budgetMs}ms`));
      }, budgetMs);
      const checkState = () => {
        if (button.hasAttribute('aria-busy')) sawLinting = true;
        if (!sawLinting || button.hasAttribute('aria-busy') || !time.textContent) return;
        clearTimeout(timeout);
        observer.disconnect();
        resolveTime(performance.now() - startedAt);
      };
      const observer = new MutationObserver(checkState);
      observer.observe(button, { attributes: true, attributeFilter: ['aria-busy'] });
      observer.observe(time, { childList: true, subtree: true, characterData: true });

      textarea.value = content;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }, { content: markdown, budgetMs: LARGE_DOCUMENT_MAX_WALL_TIME_MS });

  assert.ok(
    wallTimeMs < LARGE_DOCUMENT_MAX_WALL_TIME_MS,
    `large-document linting took ${wallTimeMs}ms (budget: ${LARGE_DOCUMENT_MAX_WALL_TIME_MS}ms)`,
  );
  await page.close();
}

const tests = [
  ['GitHub and GitLab editors are detected', testEditorDetection],
  ['linting returns and renders real warnings', testRealLintResults],
  ['popup readiness reads live content-script status', testPageStatusMessaging],
  ['panel is keyboard-operable, inert when hidden, and restores focus', testPanelVisibilityState],
  ['panel stays inside a narrow viewport', testPanelFitsNarrowViewport],
  ['popup tabs, rules search, validation, and saving work', testPopupKeyboardAndRules],
  ['enable setting updates the active page', testRuntimeEnableToggle],
  ['gutter setting updates the active page', testRuntimeGutterToggle],
  ['linting recovers after the service worker restarts', testServiceWorkerRecovery],
  ['rapid edits never render an obsolete lint result', testLatestLintResultWins],
  ['large Markdown stays within the end-to-end performance budget', testLargeDocumentPerformance],
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
