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
// A missing pattern only counts as evidence when the site actually served us
// the real page. Sites apply bot mitigation to datacenter IPs (CI runners),
// which yields a challenge page or a stripped document with none of the JS
// bundles. Each site therefore declares a pageMarker: a long-stable substring
// of the genuine document. If the marker is absent, or no JS responses were
// intercepted at all, the check is INCONCLUSIVE and skipped — never reported
// as a selector failure.
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
import { appendFileSync } from 'fs';

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
//
// pageMarker proves the served document is the real page and not a bot
// challenge: an infrastructure-level attribute unrelated to the editor,
// stable across UI rewrites.

const SITE_CHECKS = {
  github: {
    url: 'https://github.com/rvben/rumdl/issues/1',
    pageMarker: 'octolytics-dimension-repository_nwo',
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
    // Prefix only: hydration rewrites issues:show into the work-items SPA
    // (data-page="projects:work_items:show"), but the "projects:" namespace
    // survives both states.
    pageMarker: 'data-page="projects:',
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

  const diag = { httpStatus: null, title: '', jsResponses: 0, jsBytes: 0 };

  try {
    const mainResponse = await page.goto(config.url, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_TIMEOUT,
    });
    diag.httpStatus = mainResponse ? mainResponse.status() : null;

    // Scroll down to trigger lazy-loaded JS bundles
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(POST_LOAD_WAIT);
  } catch (err) {
    await page.close();
    return { status: 'inconclusive', reason: `page failed to load: ${err.message}`, diag };
  }

  // Wait for all JS response bodies to resolve
  const jsBodies = await Promise.all(jsPromises);
  const allJS = jsBodies.join('\n');
  diag.jsResponses = jsBodies.length;
  diag.jsBytes = allJS.length;

  for (const pattern of config.jsPatterns) {
    if (allJS.includes(pattern)) {
      found.add(pattern);
    }
  }

  // Also check rendered DOM for selector patterns
  let html = '';
  try {
    html = await page.content();
    diag.title = await page.title();
    for (const pattern of config.jsPatterns) {
      if (html.includes(pattern)) {
        found.add(pattern);
      }
    }
  } catch {}

  await page.close();

  // Authenticity gates: a missing pattern is only meaningful on the real
  // page. A document without the marker, or a load that produced zero JS
  // responses, means the site served us something else (bot challenge,
  // error page) and the check cannot observe the selectors either way.
  if (!html.includes(config.pageMarker)) {
    return { status: 'inconclusive', reason: `page marker "${config.pageMarker}" not found — served document is not the real page`, diag };
  }
  if (jsBodies.length === 0) {
    return { status: 'inconclusive', reason: 'no JS responses intercepted — bundle interception broken or scripts blocked', diag };
  }

  const missing = config.jsPatterns.filter(p => !found.has(p));
  const passed = found.size >= config.minRequired;
  return {
    status: passed ? 'pass' : 'fail',
    found: found.size,
    total: config.jsPatterns.length,
    missing,
    diag,
  };
}

function formatDiag(diag) {
  return `http=${diag.httpStatus} title=${JSON.stringify(diag.title)} jsResponses=${diag.jsResponses} jsBytes=${diag.jsBytes}`;
}

function warn(siteName, message) {
  // GitHub Actions annotation; prints as a plain line elsewhere.
  console.log(`::warning title=Selector smoke (${siteName})::${message}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ${siteName}: ${message}\n`);
    } catch {}
  }
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

      if (result.status === 'inconclusive') {
        console.log(`  SKIP — ${result.reason}`);
        console.log(`  diag: ${formatDiag(result.diag)}\n`);
        warn(siteName, `check inconclusive, selectors not verified: ${result.reason} (${formatDiag(result.diag)})`);
        continue;
      }

      // Report each pattern
      for (const pattern of config.jsPatterns) {
        const status = result.missing.includes(pattern) ? 'MISS' : 'OK  ';
        console.log(`  ${status} ${pattern}`);
      }

      // Verdict
      if (result.status === 'pass') {
        console.log(`  --- ${result.found}/${result.total} found (need ${config.minRequired}) — PASS\n`);
      } else {
        console.log(`  --- ${result.found}/${result.total} found (need ${config.minRequired}) — FAIL`);
        console.log(`  diag: ${formatDiag(result.diag)}\n`);
        exitCode = 1;
      }
    }
  } finally {
    await context.close();
  }

  if (exitCode === 0) {
    console.log('All observable sites have sufficient selector coverage.');
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
