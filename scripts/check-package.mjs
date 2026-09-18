// Verify the archive that will be shipped, rather than the source directory.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const archive = 'rumdl-extension.zip';
const entries = new Set(execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' }).trim().split('\n'));
const manifest = JSON.parse(execFileSync('unzip', ['-p', archive, 'manifest.json'], { encoding: 'utf8' }));
const required = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  ...Object.values(manifest.icons),
  ...manifest.content_scripts.flatMap(script => [...(script.js || []), ...(script.css || [])]),
  'dist/wasm/rumdl_lib_bg.wasm',
  'popup/popup.js', 'popup/popup.css', 'popup/config-utils.js', 'popup/page-readiness.js',
  'popup/logo.svg', 'popup/logo-dark.svg',
];
for (const path of required) assert.ok(entries.has(path), `Packaged asset missing: ${path}`);
for (const path of entries) {
  assert.ok(path === 'manifest.json' || /^(dist|icons|popup)\//.test(path), `Unexpected packaged path: ${path}`);
  assert.ok(!/(^|\/)(AGENTS\.md|node_modules|tests|\.git)(\/|$)/.test(path), `Non-production file packaged: ${path}`);
}
console.log(`Package verified: ${required.length} required assets present; production directories only.`);
