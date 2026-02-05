#!/usr/bin/env node

// Copy WASM files from wasm-demo/pkg to chrome-extension/wasm

import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const wasmSrc = join(rootDir, '..', 'wasm-demo', 'pkg');
const wasmDest = join(rootDir, 'wasm');

// Files to copy
const files = [
  'rumdl_lib_bg.wasm',
  'rumdl_lib.js',
  'rumdl_lib.d.ts'
];

// Ensure destination directory exists
if (!existsSync(wasmDest)) {
  mkdirSync(wasmDest, { recursive: true });
}

// Check if source files exist
if (!existsSync(wasmSrc)) {
  console.error('Error: WASM source directory not found at:', wasmSrc);
  console.error('Please run "wasm-pack build" in the wasm-demo directory first.');
  process.exit(1);
}

// Copy files
for (const file of files) {
  const src = join(wasmSrc, file);
  const dest = join(wasmDest, file);

  if (!existsSync(src)) {
    console.warn(`Warning: ${file} not found, skipping...`);
    continue;
  }

  copyFileSync(src, dest);
  console.log(`Copied: ${file}`);
}

console.log('WASM files copied successfully!');
