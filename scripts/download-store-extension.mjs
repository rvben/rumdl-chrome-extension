#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const CRX_MAGIC = 'Cr24';
const CRX3_VERSION = 3;
const CRX3_FIXED_HEADER_BYTES = 12;
const MAX_CRX_HEADER_BYTES = 16 * 1024 * 1024;
const MAX_CRX_BYTES = 110 * 1024 * 1024;
const UPDATE_ORIGIN = 'https://clients2.google.com/service/update2/crx';

export function validateExtensionId(extensionId) {
  if (!/^[a-p]{32}$/.test(extensionId || '')) {
    throw new Error('Extension ID must contain exactly 32 letters from a to p');
  }
  return extensionId;
}

export function buildStoreDownloadUrl(extensionId, productVersion = '140.0.0.0') {
  validateExtensionId(extensionId);
  const url = new URL(UPDATE_ORIGIN);
  url.searchParams.set('response', 'redirect');
  url.searchParams.set('prodversion', productVersion);
  url.searchParams.set('acceptformat', 'crx3');
  url.searchParams.set('x', `id=${extensionId}&uc`);
  return url;
}

export function extractCrx3Zip(crxBytes) {
  if (!crxBytes || typeof crxBytes.byteLength !== 'number'
    || crxBytes.byteLength < CRX3_FIXED_HEADER_BYTES) {
    throw new Error('Downloaded extension is too small to be a CRX3 package');
  }

  const buffer = Buffer.from(crxBytes.buffer, crxBytes.byteOffset, crxBytes.byteLength);
  if (buffer.toString('ascii', 0, 4) !== CRX_MAGIC) {
    throw new Error('Downloaded extension does not have a valid CRX header');
  }
  if (buffer.readUInt32LE(4) !== CRX3_VERSION) {
    throw new Error('Downloaded extension is not a CRX3 package');
  }

  const headerLength = buffer.readUInt32LE(8);
  if (headerLength > MAX_CRX_HEADER_BYTES) {
    throw new Error(`CRX3 header is unreasonably large: ${headerLength} bytes`);
  }

  const zipOffset = CRX3_FIXED_HEADER_BYTES + headerLength;
  if (zipOffset + 4 > buffer.byteLength || buffer.toString('binary', zipOffset, zipOffset + 2) !== 'PK') {
    throw new Error('CRX3 package does not contain a valid ZIP payload');
  }
  return buffer.subarray(zipOffset);
}

export function assertSafeArchiveEntries(entries) {
  for (const entry of entries) {
    const normalized = entry.replaceAll('\\', '/');
    const segments = normalized.split('/');
    if (normalized.startsWith('/') || segments.includes('..')) {
      throw new Error(`CRX3 ZIP contains an unsafe path: ${entry}`);
    }
  }
  return entries;
}

function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith('--')) throw new Error(`Unexpected argument: ${argument}`);
    const [name, inlineValue] = argument.slice(2).split('=', 2);
    const value = inlineValue ?? args[index + 1];
    if (inlineValue === undefined) index += 1;
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${name}`);
    options[name] = value;
  }
  return options;
}

export async function downloadStoreExtension({
  extensionId,
  output,
  expectedVersion,
  productVersion,
  fetchImpl = globalThis.fetch,
}) {
  const id = validateExtensionId(extensionId);
  if (typeof fetchImpl !== 'function') throw new Error('A Fetch API implementation is required');

  const outputPath = resolve(output || 'store-extension');
  const temporaryPath = await mkdtemp(join(tmpdir(), 'rumdl-store-download-'));
  const zipPath = join(temporaryPath, 'extension.zip');

  try {
    const response = await fetchImpl(buildStoreDownloadUrl(id, productVersion), {
      redirect: 'follow',
      headers: { 'User-Agent': 'rumdl-extension-validator/1.0' },
    });
    if (!response.ok) {
      throw new Error(`Chrome Web Store download failed (${response.status} ${response.statusText})`);
    }

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_CRX_BYTES) {
      throw new Error(`Chrome Web Store package is unexpectedly large: ${contentLength} bytes`);
    }

    const crxBytes = new Uint8Array(await response.arrayBuffer());
    if (crxBytes.byteLength > MAX_CRX_BYTES) {
      throw new Error(`Chrome Web Store package is unexpectedly large: ${crxBytes.byteLength} bytes`);
    }
    const zipBytes = extractCrx3Zip(crxBytes);
    await mkdir(outputPath);
    await writeFile(zipPath, zipBytes);
    const { stdout: archiveListing } = await execFileAsync('unzip', ['-Z1', zipPath]);
    assertSafeArchiveEntries(archiveListing.split('\n').filter(Boolean));
    await execFileAsync('unzip', ['-q', zipPath, '-d', outputPath]);

    const manifest = JSON.parse(await readFile(join(outputPath, 'manifest.json'), 'utf8'));
    if (expectedVersion && manifest.version !== expectedVersion) {
      throw new Error(
        `Published extension version mismatch: expected ${expectedVersion}, downloaded ${manifest.version}`,
      );
    }

    console.log(`Downloaded Chrome Web Store extension ${id} v${manifest.version}`);
    return { extensionId: id, outputPath, version: manifest.version };
  } catch (error) {
    await rm(outputPath, { recursive: true, force: true });
    throw error;
  } finally {
    await rm(temporaryPath, { recursive: true, force: true });
  }
}

async function runCli(args) {
  const options = parseArguments(args);
  if (!options['extension-id'] || !options.output) {
    throw new Error('Usage: download-store-extension.mjs --extension-id <id> --output <dir> [--expected-version <version>]');
  }
  await downloadStoreExtension({
    extensionId: options['extension-id'],
    output: options.output,
    expectedVersion: options['expected-version'],
    productVersion: options['product-version'],
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(`Chrome Web Store download error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
