#!/usr/bin/env node

// Build script for rumdl Chrome extension
// Uses esbuild to bundle TypeScript files

import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Ensure dist directories exist
const distDirs = ['dist/background', 'dist/content', 'dist/wasm'];
for (const dir of distDirs) {
  const fullPath = join(rootDir, dir);
  if (!existsSync(fullPath)) {
    mkdirSync(fullPath, { recursive: true });
  }
}

// Copy WASM binary from node_modules to dist/wasm
const wasmSrc = join(rootDir, 'node_modules', 'rumdl-wasm', 'rumdl_lib_bg.wasm');
const wasmDest = join(rootDir, 'dist', 'wasm', 'rumdl_lib_bg.wasm');
copyFileSync(wasmSrc, wasmDest);
console.log('Copied: rumdl_lib_bg.wasm from node_modules/rumdl-wasm');

// Build content script (bundle all modules into one file)
await esbuild.build({
  entryPoints: [join(rootDir, 'src/content/content-script.ts')],
  bundle: true,
  outfile: join(rootDir, 'dist/content/content-script.js'),
  format: 'iife',
  target: 'chrome100',
  minify: false,
  sourcemap: false,
});
console.log('Built: content-script.js');

// Build service worker (ES module for Manifest V3)
// Bundle the WASM JS bindings into the service worker
await esbuild.build({
  entryPoints: [join(rootDir, 'src/background/service-worker.ts')],
  bundle: true,
  outfile: join(rootDir, 'dist/background/service-worker.js'),
  format: 'esm',
  target: 'chrome100',
  minify: false,
  sourcemap: false,
});
console.log('Built: service-worker.js');

// Copy CSS
const cssSrc = join(rootDir, 'src/content/styles.css');
const cssDest = join(rootDir, 'dist/content/styles.css');
copyFileSync(cssSrc, cssDest);
console.log('Copied: styles.css');

console.log('\nBuild complete!');
