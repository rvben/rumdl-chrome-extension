import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { startPreview } from './server.mjs';

const preview = await startPreview();
const browser = await chromium.launch(); // Ordinary browser: no extension flags or profile.
const captures = await mkdtemp(join(tmpdir(), 'rumdl-ui-'));
let passed = 0;
async function test(name, run) {
  const context = await browser.newContext({ viewport: { width: 400, height: 600 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await run(page);
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    console.log(`PASS ${name}`);
    passed++;
  } finally { await context.close(); }
}
async function popup(page, query = '') {
  await page.goto(`${preview.url}/popup/popup.html${query}`);
  await page.locator('#settingsShell').waitFor({ state: 'visible' });
  await page.locator('.brand-logo').evaluate(img => img.decode());
  await page.locator('#rulesList[aria-busy="false"]').waitFor({ state: 'attached' });
}
async function editor(page, fixture = 'github') {
  await page.goto(`${preview.url}/tests/e2e/fixtures/${fixture}-mock.html`);
  await page.locator('textarea[data-rumdl-managed]').waitFor();
}
async function warnings(page, text = '# Title\n\nText with trailing spaces.   \n') {
  await page.locator('textarea').fill(text);
  await page.locator('.rumdl-status-btn.has-warnings:not([aria-busy])').waitFor();
  await page.locator('.rumdl-status-btn').click();
  await page.locator('.rumdl-panel.visible .rumdl-warning-jump').first().waitFor();
}
async function accessibility(page, include) {
  const scan = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']);
  if (include) scan.include(include);
  const { violations } = await scan.analyze();
  assert.deepEqual(violations.map(({ id, nodes }) => ({ id, targets: nodes.map(n => n.target) })), []);
}
async function fits(page, selector) {
  await page.waitForFunction(selector => {
    const rect = document.querySelector(selector)?.getBoundingClientRect();
    return rect && rect.x >= 0 && rect.y >= 0 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1;
  }, selector);
  const box = await page.locator(selector).boundingBox();
  const size = page.viewportSize();
  assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= size.width + 1 && box.y + box.height <= size.height + 1, `${selector} fits viewport`);
}
try {
  await test('Popup keyboard tabs, validation, persistence and rapid saves', async page => {
    await popup(page);
    const general = page.getByRole('tab', { name: 'General' });
    await general.focus();
    await general.press('ArrowRight');
    assert.equal(await page.getByRole('tab', { name: 'Rules' }).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('End');
    assert.equal(await page.getByRole('tab', { name: 'Advanced' }).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Home');
    const length = page.getByRole('spinbutton', { name: 'Line length' });
    await length.fill('39'); await length.press('Tab');
    assert.equal(await length.getAttribute('aria-invalid'), 'true');
    assert.equal(await page.evaluate(() => localStorage.getItem('rumdl_config')), null);
    await page.evaluate(() => { preview.delay = 80; });
    for (const value of ['100', '120', '140']) { await length.fill(value); await length.press('Tab'); }
    await page.locator('#saveStatus[data-state="saved"]').waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.rumdl_config).lineLength), 140);
    await page.reload(); await page.locator('#settingsShell').waitFor({ state: 'visible' });
    assert.equal(await length.inputValue(), '140');
  });
  await test('Rules use real WASM catalog, search, empty state and allowlist protection', async page => {
    await popup(page);
    assert.ok(await page.locator('.rule-item').count() > 60);
    await page.getByRole('tab', { name: 'Rules' }).click();
    const search = page.getByRole('searchbox');
    await search.fill('MD013');
    assert.equal(await page.locator('.rule-item').count(), 1);
    await page.locator('[data-rule="MD013"]').uncheck();
    await page.locator('#saveStatus[data-state="saved"]').waitFor();
    assert.ok(await page.evaluate(() => JSON.parse(localStorage.rumdl_config).disabledRules.includes('MD013')));
    await search.fill('no-such-rule');
    await page.getByRole('button', { name: 'Clear search' }).click();
    assert.equal(await search.inputValue(), '');
    await page.locator('summary').click();
    await page.locator('#enabledRules').fill('MD001'); await page.locator('#enabledRules').press('Tab');
    await page.locator('#saveStatus[data-state="saved"]').waitFor();
    assert.equal(await page.locator('[data-rule="MD001"]').isDisabled(), true);
  });
  await test('Storage failures recover without discarding settings', async page => {
    await page.goto(`${preview.url}/popup/popup.html?failLoad`);
    await page.getByRole('button', { name: 'Try again' }).waitFor();
    await page.evaluate(() => { preview.failLoad = false; });
    await page.getByRole('button', { name: 'Try again' }).click();
    await page.locator('#settingsShell').waitFor({ state: 'visible' });
    await page.evaluate(() => { preview.failSave = true; });
    await page.locator('#flavor').selectOption('mdx');
    await page.locator('#retrySaveBtn').waitFor({ state: 'visible' });
    await page.evaluate(() => { preview.failSave = false; });
    await page.locator('#retrySaveBtn').click();
    await page.locator('#saveStatus[data-state="saved"]').waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.rumdl_config).flavor), 'mdx');
  });
  await test('Rule service failure can be retried', async page => {
    await page.goto(`${preview.url}/popup/popup.html?failRules`);
    await page.getByRole('tab', { name: 'Rules' }).click();
    await page.locator('#rulesList button').waitFor();
    await page.evaluate(() => { preview.failRules = false; });
    await page.locator('#rulesList button').click();
    await page.locator('.rule-item').first().waitFor();
  });
  await test('Import, export and reset preserve the user workflow', async page => {
    await popup(page);
    await page.getByRole('tab', { name: 'Advanced' }).click();
    await page.locator('#importFile').setInputFiles({ name: 'settings.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ lineLength: 110, flavor: 'quarto', enabled: true })) });
    await page.locator('#saveStatus[data-state="saved"]').waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.rumdl_config).lineLength), 110);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export settings' }).click();
    assert.match((await download).suggestedFilename(), /\.json$/);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await page.locator('#saveStatus').filter({ hasText: 'Settings reset' }).waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.rumdl_config).lineLength), 80);
  });
  await test('Loading and readiness states communicate the current page', async page => {
    await page.goto(`${preview.url}/popup/popup.html?delay=400`);
    assert.equal(await page.locator('#mainContent').getAttribute('aria-busy'), 'true');
    await page.locator('#settingsShell').waitFor({ state: 'visible' });
    for (const [query, title] of [
      ['?page=https://example.com', 'Open GitHub or GitLab'],
      ['?editors=0', 'Ready when the editor opens'],
      ['?unhealthy', 'Linting is temporarily unavailable'],
    ]) {
      await popup(page, query);
      await page.locator('#pageReadinessTitle').filter({ hasText: title }).waitFor();
    }
    await page.locator('#enabled').uncheck();
    await page.locator('#pageReadinessTitle').filter({ hasText: 'rumdl is paused' }).waitFor();
  });
  await test('Issues and timing button keeps its size through loading and changing digits', async page => {
    await page.setViewportSize({ width: 320, height: 480 });
    await editor(page);
    const button = page.locator('.rumdl-status-btn');
    const baseline = await button.boundingBox();
    for (const [count, time] of [['0', ''], ['1', '1ms'], ['99', '99ms'], ['9999', '9999ms'], ['99999', 'Checking…']]) {
      await button.evaluate((el, [count, time]) => {
        el.querySelector('.rumdl-status-count').textContent = count;
        el.querySelector('.rumdl-status-time').textContent = time;
      }, [count, time]);
      const box = await button.boundingBox();
      assert.equal(box.width, baseline.width);
      assert.equal(box.height, baseline.height);
      assert.equal(box.x, baseline.x);
      assert.equal(box.y, baseline.y);
      if (count === '1') {
        const spacing = await button.evaluate(el => {
          const icon = el.querySelector('svg').getBoundingClientRect();
          const count = el.querySelector('.rumdl-status-count').getBoundingClientRect();
          const time = el.querySelector('.rumdl-status-time').getBoundingClientRect();
          return { iconGap: count.left - icon.right, timeGap: time.left - count.right, countWidth: count.width };
        });
        assert.ok(spacing.iconGap <= 6 && spacing.timeGap <= 6, 'Small numbers form a compact group');
        assert.ok(spacing.countWidth < 12, 'A single digit does not occupy a multi-digit column');
      }
      assert.ok(await button.locator('.rumdl-status-time').evaluate(el => el.textContent !== 'Checking…' || el.scrollWidth <= el.clientWidth), 'Checking label fits without clipping');
    }
    await page.locator('textarea').fill('# Title\n\nTrailing.   \n');
    await page.locator('.rumdl-status-btn.has-warnings:not([aria-busy])').waitFor();
    const ready = await button.boundingBox();
    assert.equal(ready.width, baseline.width);
    assert.equal(ready.height, baseline.height);
    await fits(page, '.rumdl-status-btn');
  });
  for (const fixture of ['github', 'gitlab']) {
    await test(`${fixture}: status button stays within toolbar padding on small screens`, async page => {
      await editor(page, fixture);
      for (const width of [320, 280, 240, 1000, 320]) {
        await page.setViewportSize({ width, height: 480 });
        await page.locator('.rumdl-status-btn').evaluate(button => {
          const parent = button.parentElement;
          const bounds = parent.getBoundingClientRect();
          const style = getComputedStyle(parent);
          const rect = button.getBoundingClientRect();
          const left = bounds.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
          const right = bounds.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
          const top = bounds.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop);
          const bottom = bounds.bottom - parseFloat(style.borderBottomWidth) - parseFloat(style.paddingBottom);
          if (rect.left < left - 1 || rect.right > right + 1 || rect.top < top - 1 || rect.bottom > bottom + 1) throw new Error(`Status button exceeds toolbar content bounds at ${innerWidth}px: ${JSON.stringify({ rect: rect.toJSON(), left, right, top, bottom })}`);
          if (parent.scrollWidth > parent.clientWidth) throw new Error('Toolbar has horizontal overflow');
        });
      }
      await page.evaluate(async () => {
        const { rumdl_config } = await chrome.storage.sync.get('rumdl_config');
        await chrome.storage.sync.set({ rumdl_config: { ...rumdl_config, enabled: false } });
      });
      await page.locator('.rumdl-status-btn').waitFor({ state: 'detached' });
      assert.equal(await page.locator('.rumdl-status-toolbar').count(), 0, 'Original toolbar layout is restored on disable');
    });
  }
  await test('Large documents lint within a practical browser budget', async page => {
    await editor(page);
    const text = Array.from({ length: 1200 }, (_, i) => `Paragraph ${i}: ${'word '.repeat(24)}`).join('\n\n');
    const elapsed = await page.evaluate(content => new Promise((resolve, reject) => {
      const textarea = document.querySelector('textarea');
      const button = document.querySelector('.rumdl-status-btn');
      let checking = false;
      const timeout = setTimeout(() => { observer.disconnect(); reject(new Error('Lint exceeded 2.5 seconds')); }, 2500);
      const start = performance.now();
      const observer = new MutationObserver(() => {
        checking ||= button.hasAttribute('aria-busy');
        if (checking && !button.hasAttribute('aria-busy')) {
          observer.disconnect(); clearTimeout(timeout); resolve(performance.now() - start);
        }
      });
      observer.observe(button, { attributes: true, childList: true, subtree: true });
      textarea.value = content;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }), text);
    assert.ok(elapsed < 2500, `1200 paragraphs including gutter rendering: ${elapsed.toFixed(0)}ms`);
    console.log(`  Large-document browser time: ${elapsed.toFixed(0)}ms`);
  });
  for (const theme of ['light', 'dark']) {
    await test(`${theme} popup: all tabs, accessibility, narrow viewport and reduced motion`, async page => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await popup(page);
      for (const name of ['General', 'Rules', 'Advanced']) {
        await page.getByRole('tab', { name }).click();
        await accessibility(page);
        await fits(page, '.popup');
        await page.screenshot({ path: join(captures, `popup-${theme}-${name}.png`) });
      }
      await page.setViewportSize({ width: 320, height: 480 });
      await page.getByRole('tab', { name: 'General' }).click();
      await fits(page, '.popup');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await accessibility(page);
      await page.screenshot({ path: join(captures, `popup-${theme}-narrow.png`) });
    });
  }
  for (const fixture of ['github', 'gitlab']) {
    await test(`${fixture}: real linting, jump, individual fix, fix all, empty state and focus`, async page => {
      await page.setViewportSize({ width: 1000, height: 720 });
      await editor(page, fixture); await warnings(page);
      await accessibility(page, '.rumdl-panel');
      await page.screenshot({ path: join(captures, `editor-${fixture}.png`) });
      await page.locator('.rumdl-warning-jump').first().click();
      assert.equal(await page.evaluate(() => document.activeElement.tagName), 'TEXTAREA');
      await page.locator('.rumdl-btn-fix-one').first().click();
      await page.locator('.rumdl-status-btn:not([aria-busy])').waitFor();
      assert.ok(!(await page.locator('textarea').inputValue()).includes('spaces.   '));
      await warningsAfterEdit(page);
      await page.locator('.rumdl-btn-fix').click();
      await page.locator('.rumdl-empty').waitFor();
      await page.locator('.rumdl-btn-close').click();
      assert.equal(await page.locator('.rumdl-panel').getAttribute('inert'), '');
      assert.equal(await page.evaluate(() => document.activeElement.classList.contains('rumdl-status-btn')), true);
      await page.locator('.rumdl-status-btn').click();
      await page.waitForFunction(() => document.activeElement?.classList.contains('rumdl-panel'));
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.rumdl-panel').isVisible(), false);
    });
  }
  await test('Host light theme wins over system dark; dark controls meet contrast requirements', async page => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 1000, height: 720 });
    await editor(page); await warnings(page);
    assert.equal(await page.locator('.rumdl-panel').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 253, 251)');
    await page.evaluate(() => document.documentElement.setAttribute('data-color-mode', 'dark'));
    await accessibility(page, '.rumdl-panel');
    await page.locator('.rumdl-btn-fix').hover();
    await accessibility(page, '.rumdl-panel');
    await page.screenshot({ path: join(captures, 'editor-dark.png') });
    await page.setViewportSize({ width: 320, height: 480 });
    await page.locator('textarea').fill('# Title\n\n' + 'Trailing.   \n\n'.repeat(30));
    await page.locator('.rumdl-status-btn.has-warnings:not([aria-busy])').waitFor();
    await fits(page, '.rumdl-panel');
    await page.screenshot({ path: join(captures, 'editor-narrow.png') });
  });
  await test('Batched gutter measurements preserve wrapped-line positions and keyboard tooltips', async page => {
    await page.setViewportSize({ width: 700, height: 600 });
    await editor(page);
    await page.locator('textarea').fill(`# Title\n${'word '.repeat(150)}\nTrailing text.   \n`);
    const marker = page.locator('.rumdl-gutter-marker[aria-label^="Line 3:"]');
    await marker.waitFor();
    const positions = await page.evaluate(() => {
      const textarea = document.querySelector('textarea');
      const style = getComputedStyle(textarea);
      const mirror = document.createElement('div');
      mirror.style.cssText = `position:absolute;visibility:hidden;white-space:pre-wrap;word-wrap:break-word;width:${textarea.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)}px;font:${style.font};line-height:${style.lineHeight}`;
      mirror.textContent = textarea.value.split('\n').slice(0, 2).join('\n');
      document.body.append(mirror);
      const expected = mirror.offsetHeight + parseFloat(document.querySelector('.rumdl-line-number').style.height) / 2 - 5;
      mirror.remove();
      return { expected, actual: parseFloat(document.querySelector('.rumdl-gutter-marker[aria-label^="Line 3:"]').style.top) };
    });
    assert.ok(Math.abs(positions.expected - positions.actual) <= 1);
    // Scroll the editor to the logical line before exposing its keyboard details.
    const markerTop = await marker.evaluate(el => parseFloat(el.style.top));
    await page.locator('textarea').evaluate((el, top) => { el.scrollTop = top - 50; el.dispatchEvent(new Event('scroll')); }, markerTop);
    await marker.focus();
    assert.equal(await marker.evaluate(el => el === document.activeElement), true);
    await page.locator('.rumdl-tooltip').waitFor({ state: 'visible' });
    await marker.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement.tagName), 'TEXTAREA');
  });
  await test('GitHub active theme wins over configured dark preference and tracks live changes', async page => {
    await page.setViewportSize({ width: 1000, height: 720 });
    await editor(page); await warnings(page);
    for (const system of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: system });
      for (const mode of ['light', 'dark', 'auto']) {
        await page.evaluate(mode => {
          const root = document.documentElement;
          root.dataset.colorMode = mode;
          root.dataset.lightTheme = 'light';
          root.dataset.darkTheme = 'dark';
        }, mode);
        const dark = mode === 'dark' || (mode === 'auto' && system === 'dark');
        assert.equal(await page.locator('.rumdl-panel').evaluate(el => getComputedStyle(el).backgroundColor), dark ? 'rgb(27, 24, 28)' : 'rgb(255, 253, 251)');
      }
    }
  });
  await test('Scrolled warning markers stay inside the editor and cannot cover page text', async page => {
    await page.setViewportSize({ width: 320, height: 480 });
    await editor(page);
    await page.locator('textarea').fill('# Title\n\n' + 'Trailing.   \n\n'.repeat(30));
    await page.locator('.rumdl-status-btn.has-warnings:not([aria-busy])').waitFor();
    for (const scroll of [0, 150, 10000]) {
      await page.locator('textarea').evaluate((el, scroll) => { el.scrollTop = scroll; el.dispatchEvent(new Event('scroll')); }, scroll);
      const result = await page.evaluate(() => {
        const gutter = document.querySelector('.rumdl-gutter');
        const rect = gutter.getBoundingClientRect();
        let visible = 0;
        let escaped = 0;
        for (const marker of gutter.querySelectorAll('button')) {
          if (marker.hidden) { if (marker.getClientRects().length) escaped++; continue; }
          visible++;
          const box = marker.getBoundingClientRect();
          const x = box.left + box.width / 2, y = box.top + box.height / 2;
          if (y < rect.top || y >= rect.bottom) {
            if (document.elementFromPoint(x, y) === marker) escaped++;
          }
        }
        return { escaped, visible, clip: getComputedStyle(gutter).overflow };
      });
      assert.equal(result.clip, 'hidden');
      assert.equal(result.escaped, 0);
      assert.ok(result.visible > 0);
    }
  });
  await test('IDE gutter reserves text space, numbers clean lines, updates typing, and restores editor styles', async page => {
    await page.setViewportSize({ width: 700, height: 600 });
    await editor(page);
    await page.locator('textarea').fill('# Clean document\n\nA paragraph.\n');
    await page.waitForFunction(() => document.querySelectorAll('.rumdl-line-number').length === 4);
    const layout = await page.evaluate(() => {
      const textarea = document.querySelector('textarea');
      const gutter = document.querySelector('.rumdl-gutter').getBoundingClientRect();
      const style = getComputedStyle(textarea);
      return { gutterRight: gutter.right, textLeft: textarea.getBoundingClientRect().left + textarea.clientLeft + parseFloat(style.paddingLeft) };
    });
    assert.ok(layout.gutterRight < layout.textLeft);
    assert.deepEqual(await page.locator('.rumdl-line-number').allTextContents(), ['1', '2', '3', '4']);
    await page.locator('textarea').fill('# Title\n\n' + 'Paragraph.\n'.repeat(110));
    await page.waitForFunction(() => document.querySelectorAll('.rumdl-line-number').length === 113);
    const threeDigitPadding = await page.locator('textarea').evaluate(el => parseFloat(getComputedStyle(el).paddingLeft));
    assert.ok(threeDigitPadding >= 58);
    await page.locator('textarea').fill('');
    await page.waitForFunction(() => document.querySelectorAll('.rumdl-line-number').length === 1);
    await page.evaluate(async () => {
      const { rumdl_config } = await chrome.storage.sync.get('rumdl_config');
      await chrome.storage.sync.set({ rumdl_config: { ...rumdl_config, showGutterIcons: false } });
    });
    await page.locator('.rumdl-gutter').waitFor({ state: 'detached' });
    assert.equal(await page.locator('textarea').evaluate(el => el.style.getPropertyValue('padding-left')), '');
    assert.equal(await page.locator('textarea').evaluate(el => el.style.getPropertyValue('box-sizing')), '');
  });
  await test('Line numbers and warning markers align after wrapping and resizing', async page => {
    await page.setViewportSize({ width: 700, height: 600 });
    await editor(page);
    await page.locator('textarea').fill(`# Title\n\n${'word '.repeat(100)}\n\nTrailing.   \n`);
    await page.locator('.rumdl-status-btn.has-warnings:not([aria-busy])').waitFor();
    const positions = () => page.evaluate(() => {
      const number = [...document.querySelectorAll('.rumdl-line-number')].find(el => el.textContent === '5');
      const marker = document.querySelector('.rumdl-gutter-marker[aria-label^="Line 5:"]');
      return { number: parseFloat(number.style.top), marker: parseFloat(marker.style.top), height: parseFloat(number.style.height) };
    });
    const wide = await positions();
    await page.setViewportSize({ width: 400, height: 600 });
    await page.waitForFunction(old => {
      const number = [...document.querySelectorAll('.rumdl-line-number')].find(el => el.textContent === '5');
      return parseFloat(number.style.top) > old;
    }, wide.number);
    const narrow = await positions();
    assert.ok(Math.abs(narrow.marker - narrow.number - (narrow.height - 10) / 2) < 1);
    await page.locator('textarea').evaluate(el => { el.scrollTop = 100; el.dispatchEvent(new Event('scroll')); });
    assert.equal(await page.locator('.rumdl-gutter > div').evaluate(el => el.style.transform), 'translateY(-100px)');
    await accessibility(page, '.rumdl-gutter');
  });
  await test('Unicode document jumps and all individual fix paths preserve emoji and surrounding text', async page => {
    await page.setViewportSize({ width: 1000, height: 720 });
    await editor(page);
    const original = '# Title\n\nCafé 😀 漢字.   \n';
    const expected = '# Title\n\nCafé 😀 漢字.\n';
    await warnings(page, original);
    await page.locator('.rumdl-warning-jump').first().click();
    assert.equal(await page.locator('textarea').evaluate(el => el.selectionStart), original.indexOf('   '));
    await page.locator('.rumdl-btn-fix-one').first().click();
    assert.equal(await page.locator('textarea').inputValue(), expected);
    await page.locator('.rumdl-btn-close').click();
    await page.locator('textarea').fill(original);
    await page.locator('.rumdl-status-btn.has-warnings:not([aria-busy])').waitFor();
    await page.locator('.rumdl-gutter-marker:not([hidden])').first().click();
    await fits(page, '.rumdl-tooltip');
    await accessibility(page, '.rumdl-tooltip');
    await page.locator('.rumdl-tooltip-fix').focus();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.rumdl-tooltip').evaluate(el => el.inert), true);
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains('rumdl-gutter-marker')), true);
    await page.locator('.rumdl-gutter-marker:not([hidden])').first().click();
    await page.locator('.rumdl-tooltip-fix').click();
    assert.equal(await page.evaluate(() => document.activeElement.tagName), 'TEXTAREA');
    assert.equal(await page.locator('textarea').inputValue(), expected);
    await page.locator('textarea').fill(original);
    await page.locator('.rumdl-status-btn.has-warnings:not([aria-busy])').waitFor();
    await page.locator('textarea').evaluate(el => { el.focus(); el.setSelectionRange(el.value.indexOf('   '), el.value.indexOf('   ')); });
    const modifier = await page.evaluate(() => /mac/i.test(navigator.userAgentData?.platform || navigator.platform)) ? 'Meta' : 'Control';
    await page.locator('textarea').press(`${modifier}+.`);
    assert.equal(await page.locator('textarea').inputValue(), expected);
  });
  await test('Runtime toggles clean up and recreate UI; latest edits win', async page => {
    await editor(page);
    await page.evaluate(async () => {
      const { rumdl_config } = await chrome.storage.sync.get('rumdl_config');
      await chrome.storage.sync.set({ rumdl_config: { ...rumdl_config, enabled: false } });
    });
    await page.locator('textarea[data-rumdl-managed]').waitFor({ state: 'detached' });
    assert.equal(await page.locator('.rumdl-gutter').count(), 0);
    await page.evaluate(async () => {
      const { rumdl_config } = await chrome.storage.sync.get('rumdl_config');
      await chrome.storage.sync.set({ rumdl_config: { ...rumdl_config, enabled: true, showGutterIcons: false } });
    });
    await page.locator('textarea[data-rumdl-managed]').waitFor();
    assert.equal(await page.locator('.rumdl-gutter').count(), 0);
    await page.locator('textarea').fill('# Duplicate\n\n'.repeat(200));
    await page.locator('textarea').fill('# Clean document\n');
    await page.waitForFunction(() => document.querySelector('.rumdl-status-count').textContent === '0' && !document.querySelector('.rumdl-status-btn').hasAttribute('aria-busy'));
  });
  console.log(`\n${passed} browser scenarios passed. Captures: ${captures}`);
} finally {
  await browser.close();
  await new Promise(resolve => preview.server.close(resolve));
}
async function warningsAfterEdit(page) {
  await page.locator('textarea').fill('# Title\n\nAnother line.   \n');
  await page.locator('.rumdl-status-btn.has-warnings:not([aria-busy])').waitFor();
  await page.locator('.rumdl-btn-fix-one').first().waitFor();
}
