#!/usr/bin/env node

// Copy WASM files from wasm-demo/pkg to chrome-extension/wasm

import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
// Try multiple possible source locations
const wasmSrcPaths = [
  join(rootDir, '..', 'rumdl', 'wasm-demo', 'pkg'),  // rumdl project's wasm-demo
  join(rootDir, '..', 'rumdl', 'pkg'),               // rumdl project's pkg
  join(rootDir, '..', 'wasm-demo', 'pkg'),           // sibling wasm-demo
];
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

// Check if files already exist in destination
const allFilesExist = files.every(file => existsSync(join(wasmDest, file)));
if (allFilesExist) {
  console.log('WASM files already exist in destination, skipping copy.');
  process.exit(0);
}

// Find source directory
let wasmSrc = null;
for (const srcPath of wasmSrcPaths) {
  if (existsSync(srcPath)) {
    wasmSrc = srcPath;
    break;
  }
}

if (!wasmSrc) {
  console.error('Error: WASM source directory not found. Tried:');
  wasmSrcPaths.forEach(p => console.error('  -', p));
  console.error('Please run "wasm-pack build" in the rumdl/wasm-demo directory first.');
  process.exit(1);
}

console.log('Found WASM source at:', wasmSrc);

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
