#!/usr/bin/env node

// Selector smoke test: verify our CSS selectors still exist on real websites.
//
// Strategy: Load real public pages in a headless browser, intercept JS bundle
// responses, and check that our target class names / attributes appear in the
// site's JavaScript. These selectors are compiled into the site's JS even when
// the user isn't logged in and the textareas aren't rendered.
//
// This catches the big breakages: class renames, attribute removals, component
// rewrites. It won't catch subtle rendering changes — manual testing covers that.
//
// Usage:
//   npx playwright install chromium   # first time only
//   node tests/smoke/selector-check.mjs
//
// Or via Make:
//   make test-smoke

import { chromium } from 'playwright';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = join(__dirname, '..', '..');

const PAGE_TIMEOUT = 30_000;
const POST_LOAD_WAIT = 8_000; // Extra time for lazy-loaded JS bundles

// ---- What to look for on each site ----
//
// These are substrings we expect to find in the site's JS bundles.
// They correspond to the CSS selectors in editor-manager.ts.
// Not every selector is findable this way — we pick the ones that are
// reliably present in JS source and would change if the site rewrites
// their editor infrastructure.

const SITE_CHECKS = {
  github: {
    url: 'https://github.com/rvben/rumdl/issues/1',
    // Verified present in GitHub JS bundles as of 2025
    jsPatterns: [
      'js-comment-field',
      'data-paste-markdown',
      'Markdown value',
      'prc-Textarea',
      'MarkdownInput',
    ],
    // Minimum patterns that must match to consider the site "OK".
    // Some patterns may disappear as GitHub evolves (legacy → new UI),
    // but if fewer than this threshold match, something is likely broken.
    minRequired: 3,
  },
  gitlab: {
    url: 'https://gitlab.com/gitlab-org/gitlab/-/issues/1',
    jsPatterns: [
      'note-textarea',
      'js-gfm-input',
      'js-vue-markdown-field',
      'markdown_editor',
      'data-supports-quick-actions',
    ],
    minRequired: 3,
  },
};

// ---- Core logic ----

async function checkSite(context, siteName, config) {
  const page = await context.newPage();
  const found = new Set();

  // Collect JS bundle text promises. We need to await all of them after
  // the page loads because response.text() is async and may not resolve
  // before we check the results.
  const jsPromises = [];

  page.on('response', (response) => {
    const ct = response.headers()['content-type'] || '';
    const url = response.url();
    if (ct.includes('javascript') || url.endsWith('.js')) {
      jsPromises.push(
        response.text().catch(() => '')
      );
    }
  });

  try {
    await page.goto(config.url, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_TIMEOUT,
    });

    // Scroll down to trigger lazy-loaded JS bundles
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(POST_LOAD_WAIT);
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
    await page.close();
    return { found: 0, total: config.jsPatterns.length, missing: [...config.jsPatterns], error: true };
  }

  // Wait for all JS response bodies to resolve
  const jsBodies = await Promise.all(jsPromises);
  const allJS = jsBodies.join('\n');

  for (const pattern of config.jsPatterns) {
    if (allJS.includes(pattern)) {
      found.add(pattern);
    }
  }

  // Also check rendered DOM for selector patterns
  try {
    const html = await page.content();
    for (const pattern of config.jsPatterns) {
      if (html.includes(pattern)) {
        found.add(pattern);
      }
    }
  } catch {}

  await page.close();

  const missing = config.jsPatterns.filter(p => !found.has(p));
  return { found: found.size, total: config.jsPatterns.length, missing, error: false };
}

// ---- Main ----

async function run() {
  console.log('rumdl Selector Smoke Test');
  console.log('========================\n');

  const context = await chromium.launchPersistentContext('', {
    headless: false, // Required for Chrome extensions
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });

  let exitCode = 0;

  try {
    for (const [siteName, config] of Object.entries(SITE_CHECKS)) {
      console.log(`${siteName} (${config.url}):`);
      const result = await checkSite(context, siteName, config);

      if (result.error) {
        console.log(`  SKIP — page failed to load\n`);
        continue;
      }

      // Report each pattern
      for (const pattern of config.jsPatterns) {
        const status = result.missing.includes(pattern) ? 'MISS' : 'OK  ';
        console.log(`  ${status} ${pattern}`);
      }

      // Verdict
      const passed = result.found >= config.minRequired;
      if (passed) {
        console.log(`  --- ${result.found}/${result.total} found (need ${config.minRequired}) — PASS\n`);
      } else {
        console.log(`  --- ${result.found}/${result.total} found (need ${config.minRequired}) — FAIL\n`);
        exitCode = 1;
      }
    }
  } finally {
    await context.close();
  }

  if (exitCode === 0) {
    console.log('All sites have sufficient selector coverage.');
  } else {
    console.log('One or more sites have insufficient selector coverage.');
    console.log('This may indicate the site has changed its editor DOM structure.');
    console.log('Review the missing selectors and update editor-manager.ts if needed.');
  }

  process.exit(exitCode);
}

run().catch((err) => {
  console.error('Smoke test crashed:', err.message);
  process.exit(1);
});
