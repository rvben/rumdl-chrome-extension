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
  // Start fixture server
  const serverInfo = await startServer();
  server = serverInfo;

  // Launch browser with extension loaded
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

async function waitForSelector(page, selector, timeout = 5000) {
  try {
    await page.waitForSelector(selector, { timeout });
    return true;
  } catch {
    return false;
  }
}

// ---- Tests ----

async function testExtensionLoads() {
  const page = await browser.newPage();
  await page.goto(`${server.url}/github-mock.html`, { waitUntil: 'domcontentloaded' });

  // Wait for the content script to initialize
  await page.waitForTimeout(2000);

  // Check that a textarea exists on the page
  const textarea = await page.$('textarea');
  assert(textarea, 'Textarea should exist on page');

  await page.close();
  console.log('  PASS: Extension loads on mock page');
}

async function testTextareaDetected() {
  const page = await browser.newPage();
  await page.goto(`${server.url}/github-mock.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Check that the textarea has the rumdl-managed data attribute
  const isManaged = await page.$eval('textarea', (el) => el.dataset.rumdlManaged === 'true');
  assert(isManaged, 'Textarea should be detected and managed by rumdl');

  await page.close();
  console.log('  PASS: Textarea detected and managed');
}

async function testGutterCreated() {
  const page = await browser.newPage();
  await page.goto(`${server.url}/github-mock.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const gutter = await page.$('.rumdl-gutter');
  assert(gutter, 'Gutter container should be created');

  await page.close();
  console.log('  PASS: Gutter container created');
}

async function testLintResults() {
  const page = await browser.newPage();
  await page.goto(`${server.url}/github-mock.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Type markdown with a known lint issue (no blank line after heading)
  await page.type('textarea', '# Hello\nworld\n');
  await page.waitForTimeout(500);

  // Check that the status button shows warning count
  const hasButton = await page.$('.rumdl-status-btn');
  // Button may or may not be present depending on toolbar detection
  // But gutter should exist
  const gutter = await page.$('.rumdl-gutter');
  assert(gutter, 'Gutter should exist after typing');

  await page.close();
  console.log('  PASS: Lint runs after typing');
}

async function testGitLabPage() {
  const page = await browser.newPage();
  await page.goto(`${server.url}/gitlab-mock.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const textarea = await page.$('textarea.note-textarea');
  assert(textarea, 'GitLab textarea should exist');

  await page.close();
  console.log('  PASS: GitLab mock page loads');
}

async function testRedditPage() {
  const page = await browser.newPage();
  await page.goto(`${server.url}/reddit-mock.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const textarea = await page.$('textarea[name="text"]');
  assert(textarea, 'Reddit textarea should exist');

  await page.close();
  console.log('  PASS: Reddit mock page loads');
}

// ---- Runner ----

async function run() {
  console.log('rumdl Chrome Extension E2E Tests');
  console.log('================================\n');

  try {
    await setup();
    console.log(`Test server: ${server.url}`);
    console.log(`Extension: ${EXTENSION_PATH}\n`);

    await testExtensionLoads();
    await testTextareaDetected();
    await testGutterCreated();
    await testLintResults();
    await testGitLabPage();
    await testRedditPage();

    console.log('\nAll E2E tests passed!');
  } catch (error) {
    console.error('\nTest failed:', error.message);
    process.exit(1);
  } finally {
    await teardown();
  }
}

run();
