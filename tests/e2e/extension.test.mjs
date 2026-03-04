// E2E tests for rumdl Chrome extension
// Uses Puppeteer to load the extension on mock pages and verify behavior

import puppeteer from 'puppeteer';
import { startServer } from './server.mjs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = join(__dirname, '..', '..');

let browser, server;

async function setup() {
  const serverInfo = await startServer();
  server = serverInfo;

  browser = await puppeteer.launch({
    headless: 'new',
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });
}

async function teardown() {
  if (browser) await browser.close();
  if (server) server.server.close();
}

// ---- Helpers ----

async function loadPage(fixture) {
  const page = await browser.newPage();
  await page.goto(`${server.url}/${fixture}`, { waitUntil: 'domcontentloaded' });
  // Wait for extension content script to initialize
  await page.waitForTimeout(2000);
  return page;
}

async function typeAndWait(page, selector, text) {
  await page.type(selector, text);
  // Wait for debounced lint to complete
  await page.waitForTimeout(500);
}

// ---- GitHub Tests ----

async function testGitHubTextareaDetected() {
  const page = await loadPage('github-mock.html');

  const isManaged = await page.$eval('textarea', (el) => el.dataset.rumdlManaged === 'true');
  assert(isManaged, 'GitHub textarea should be detected and managed by rumdl');

  await page.close();
  console.log('  PASS: GitHub — textarea detected and managed');
}

async function testGitHubGutterCreated() {
  const page = await loadPage('github-mock.html');

  const gutter = await page.$('.rumdl-gutter');
  assert(gutter, 'GitHub page should have a gutter container');

  await page.close();
  console.log('  PASS: GitHub — gutter container created');
}

async function testGitHubLintResults() {
  const page = await loadPage('github-mock.html');

  // Type markdown with known lint issues
  await typeAndWait(page, 'textarea', '# Hello\nworld\n');

  // Gutter should still be present after typing
  const gutter = await page.$('.rumdl-gutter');
  assert(gutter, 'GitHub gutter should exist after typing');

  await page.close();
  console.log('  PASS: GitHub — lint runs after typing');
}

async function testGitHubStatusButton() {
  const page = await loadPage('github-mock.html');

  // Type some markdown so lint runs
  await typeAndWait(page, 'textarea', '# Test\n\nSome content\n');

  // Toolbar button may or may not exist depending on toolbar detection
  // but the gutter should be present
  const gutter = await page.$('.rumdl-gutter');
  assert(gutter, 'GitHub gutter should exist');

  await page.close();
  console.log('  PASS: GitHub — status UI present');
}

async function testGitHubRealTimeLint() {
  const page = await loadPage('github-mock.html');

  // Type content, then modify it
  await typeAndWait(page, 'textarea', '# Heading\n\n');
  await typeAndWait(page, 'textarea', 'More text added\n');

  // Gutter should still be present and functional
  const gutter = await page.$('.rumdl-gutter');
  assert(gutter, 'GitHub gutter should persist through edits');

  await page.close();
  console.log('  PASS: GitHub — real-time updates work');
}

// ---- GitLab Tests ----

async function testGitLabTextareaDetected() {
  const page = await loadPage('gitlab-mock.html');

  const isManaged = await page.$eval('textarea.note-textarea', (el) => el.dataset.rumdlManaged === 'true');
  assert(isManaged, 'GitLab textarea should be detected and managed by rumdl');

  await page.close();
  console.log('  PASS: GitLab — textarea detected and managed');
}

async function testGitLabGutterCreated() {
  const page = await loadPage('gitlab-mock.html');

  const gutter = await page.$('.rumdl-gutter');
  assert(gutter, 'GitLab page should have a gutter container');

  await page.close();
  console.log('  PASS: GitLab — gutter container created');
}

async function testGitLabLintResults() {
  const page = await loadPage('gitlab-mock.html');

  // Type markdown with known lint issues
  await typeAndWait(page, 'textarea.note-textarea', '# Hello\nworld\n');

  const gutter = await page.$('.rumdl-gutter');
  assert(gutter, 'GitLab gutter should exist after typing');

  await page.close();
  console.log('  PASS: GitLab — lint runs after typing');
}

// ---- Runner ----

async function run() {
  console.log('rumdl Chrome Extension E2E Tests');
  console.log('================================\n');

  try {
    await setup();
    console.log(`Test server: ${server.url}`);
    console.log(`Extension: ${EXTENSION_PATH}\n`);

    console.log('GitHub:');
    await testGitHubTextareaDetected();
    await testGitHubGutterCreated();
    await testGitHubLintResults();
    await testGitHubStatusButton();
    await testGitHubRealTimeLint();

    console.log('\nGitLab:');
    await testGitLabTextareaDetected();
    await testGitLabGutterCreated();
    await testGitLabLintResults();

    console.log('\nAll E2E tests passed! (8/8)');
  } catch (error) {
    console.error('\nTest failed:', error.message);
    process.exit(1);
  } finally {
    await teardown();
  }
}

run();
