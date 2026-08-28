#!/usr/bin/env node

import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const API_ORIGIN = 'https://chromewebstore.googleapis.com';
const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_POLL_TIMEOUT_MS = 5 * 60_000;
const SUCCESSFUL_UPLOAD_STATE = 'SUCCEEDED';
const PENDING_UPLOAD_STATE = 'IN_PROGRESS';

export class ChromeWebStoreError extends Error {
  constructor(message, { status, details } = {}) {
    super(message);
    this.name = 'ChromeWebStoreError';
    this.status = status;
    this.details = details;
  }
}

function requireValue(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ChromeWebStoreError(`${name} is required`);
  }
  return value.trim();
}

function itemName(publisherId, extensionId) {
  return `publishers/${encodeURIComponent(publisherId)}/items/${encodeURIComponent(extensionId)}`;
}

async function requestJson(fetchImpl, url, options) {
  const response = await fetchImpl(url, options);
  const responseText = await response.text();
  let payload = {};

  if (responseText) {
    try {
      payload = JSON.parse(responseText);
    } catch {
      throw new ChromeWebStoreError(
        `Chrome Web Store returned a non-JSON response (${response.status})`,
        { status: response.status },
      );
    }
  }

  if (!response.ok) {
    const apiMessage = payload?.error?.message || payload?.message || response.statusText;
    throw new ChromeWebStoreError(
      `Chrome Web Store request failed (${response.status}): ${apiMessage}`,
      { status: response.status, details: payload?.error?.details },
    );
  }

  return payload;
}

export function createChromeWebStoreClient({
  accessToken,
  publisherId,
  extensionId,
  fetchImpl = globalThis.fetch,
}) {
  const token = requireValue(accessToken, 'CWS_ACCESS_TOKEN');
  const publisher = requireValue(publisherId, 'CWS_PUBLISHER_ID');
  const extension = requireValue(extensionId, 'CWS_EXTENSION_ID');

  if (typeof fetchImpl !== 'function') {
    throw new ChromeWebStoreError('A Fetch API implementation is required');
  }

  const name = itemName(publisher, extension);
  const authorization = `Bearer ${token}`;

  return {
    async status() {
      return requestJson(fetchImpl, `${API_ORIGIN}/v2/${name}:fetchStatus`, {
        method: 'GET',
        headers: { Authorization: authorization },
      });
    },

    async upload(zipBytes) {
      if (!(zipBytes instanceof Uint8Array) || zipBytes.byteLength === 0) {
        throw new ChromeWebStoreError('The extension ZIP must not be empty');
      }

      return requestJson(fetchImpl, `${API_ORIGIN}/upload/v2/${name}:upload`, {
        method: 'POST',
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/zip',
        },
        body: zipBytes,
      });
    },

    async publish({
      publishType = 'DEFAULT_PUBLISH',
      deployPercentage = 100,
      blockOnWarnings = true,
    } = {}) {
      if (!['DEFAULT_PUBLISH', 'STAGED_PUBLISH'].includes(publishType)) {
        throw new ChromeWebStoreError(`Unsupported publish type: ${publishType}`);
      }
      if (!Number.isInteger(deployPercentage) || deployPercentage < 0 || deployPercentage > 100) {
        throw new ChromeWebStoreError('Deploy percentage must be an integer from 0 to 100');
      }

      return requestJson(fetchImpl, `${API_ORIGIN}/v2/${name}:publish`, {
        method: 'POST',
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          publishType,
          deployInfos: [{ deployPercentage }],
          skipReview: false,
          blockOnWarnings,
        }),
      });
    },
  };
}

export async function waitForUpload(client, initialUpload, {
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  timeoutMs = DEFAULT_POLL_TIMEOUT_MS,
  sleep = (duration) => new Promise((resolveSleep) => setTimeout(resolveSleep, duration)),
} = {}) {
  let state = initialUpload?.uploadState;
  const deadline = Date.now() + timeoutMs;

  while (state === PENDING_UPLOAD_STATE && Date.now() < deadline) {
    await sleep(pollIntervalMs);
    const status = await client.status();
    state = status.lastAsyncUploadState;
  }

  if (state === PENDING_UPLOAD_STATE) {
    throw new ChromeWebStoreError(`Extension upload did not finish within ${timeoutMs}ms`);
  }
  if (state !== SUCCESSFUL_UPLOAD_STATE) {
    throw new ChromeWebStoreError(`Extension upload failed with state: ${state || 'unknown'}`);
  }

  return state;
}

export function assertReleaseVersion(tag, manifestVersion, packageVersion) {
  const normalizedTag = requireValue(tag, 'Release tag').replace(/^v/, '');
  const manifest = requireValue(manifestVersion, 'Manifest version');
  const packageJson = requireValue(packageVersion, 'Package version');

  if (normalizedTag !== manifest || manifest !== packageJson) {
    throw new ChromeWebStoreError(
      `Version mismatch: tag=${normalizedTag}, manifest=${manifest}, package=${packageJson}`,
    );
  }

  return normalizedTag;
}

export function assertHealthyStatus(status) {
  const submittedState = status?.submittedItemRevisionStatus?.state;
  if (status?.takenDown) {
    throw new ChromeWebStoreError('The Chrome Web Store item has been taken down');
  }
  if (status?.warned) {
    throw new ChromeWebStoreError('The Chrome Web Store item has an unresolved policy warning');
  }
  if (submittedState === 'REJECTED') {
    throw new ChromeWebStoreError('The Chrome Web Store submission was rejected');
  }
  return status;
}

function normalizePublishType(value) {
  const normalized = (value || 'default').toLowerCase();
  if (normalized === 'default') return 'DEFAULT_PUBLISH';
  if (normalized === 'staged') return 'STAGED_PUBLISH';
  throw new ChromeWebStoreError(`Publish type must be "default" or "staged", got: ${value}`);
}

function parseArguments(args) {
  const [command = 'help', ...rest] = args;
  const options = {};

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (!argument.startsWith('--')) {
      throw new ChromeWebStoreError(`Unexpected argument: ${argument}`);
    }

    const [rawName, inlineValue] = argument.slice(2).split('=', 2);
    const value = inlineValue ?? rest[index + 1];
    if (inlineValue === undefined) index += 1;
    if (value === undefined || value.startsWith('--')) {
      throw new ChromeWebStoreError(`Missing value for --${rawName}`);
    }
    options[rawName] = value;
  }

  return { command, options };
}

function publicStatus(status) {
  if (!status || typeof status !== 'object') return status;
  const { publicKey: _publicKey, ...safeStatus } = status;
  return safeStatus;
}

async function writeGitHubSummary(lines, summaryPath = process.env.GITHUB_STEP_SUMMARY) {
  if (!summaryPath) return;
  await appendFile(summaryPath, `${lines.join('\n')}\n`, 'utf8');
}

async function writeGitHubOutput(values, outputPath = process.env.GITHUB_OUTPUT) {
  if (!outputPath) return;
  const lines = Object.entries(values).map(([name, value]) => `${name}=${value ?? ''}`);
  await appendFile(outputPath, `${lines.join('\n')}\n`, 'utf8');
}

async function loadVersions() {
  const [manifest, packageJson] = await Promise.all([
    readFile('manifest.json', 'utf8').then(JSON.parse),
    readFile('package.json', 'utf8').then(JSON.parse),
  ]);
  return { manifest: manifest.version, packageJson: packageJson.version };
}

export async function runCli(args, environment = process.env) {
  const { command, options } = parseArguments(args);

  if (command === 'check-version') {
    const versions = await loadVersions();
    const version = assertReleaseVersion(options.tag, versions.manifest, versions.packageJson);
    console.log(`Release version ${version} is consistent`);
    return { version };
  }

  if (command === 'help') {
    console.log('Usage: chrome-web-store.mjs <status|upload|publish|release|check-version> [options]');
    return {};
  }

  const client = createChromeWebStoreClient({
    accessToken: environment.CWS_ACCESS_TOKEN,
    publisherId: environment.CWS_PUBLISHER_ID,
    extensionId: environment.CWS_EXTENSION_ID,
  });

  if (command === 'status') {
    const status = publicStatus(await client.status());
    console.log(JSON.stringify(status, null, 2));
    const submittedState = status?.submittedItemRevisionStatus?.state || 'none';
    const publishedState = status?.publishedItemRevisionStatus?.state || 'none';
    const submittedVersion = status?.submittedItemRevisionStatus?.distributionChannels?.[0]?.crxVersion || '';
    const publishedVersion = status?.publishedItemRevisionStatus?.distributionChannels?.[0]?.crxVersion || '';
    await writeGitHubOutput({
      submitted_state: submittedState,
      submitted_version: submittedVersion,
      published_state: publishedState,
      published_version: publishedVersion,
    });
    await writeGitHubSummary([
      '## Chrome Web Store status',
      '',
      `- Submitted revision: \`${submittedState}\` (${submittedVersion || 'no version'})`,
      `- Published revision: \`${publishedState}\` (${publishedVersion || 'no version'})`,
      `- Policy warning: \`${Boolean(status?.warned)}\``,
      `- Taken down: \`${Boolean(status?.takenDown)}\``,
    ]);
    if (options['fail-on-problem'] === 'true') assertHealthyStatus(status);
    return status;
  }

  if (command === 'publish') {
    const result = await client.publish({
      publishType: normalizePublishType(options.type),
      deployPercentage: Number(options.percentage ?? 100),
    });
    console.log(`Chrome Web Store submission state: ${result.state}`);
    return result;
  }

  if (!['upload', 'release'].includes(command)) {
    throw new ChromeWebStoreError(`Unknown command: ${command}`);
  }

  const zipPath = resolve(options.zip || 'rumdl-extension.zip');
  const zipBytes = await readFile(zipPath);
  const upload = await client.upload(zipBytes);
  await waitForUpload(client, upload);
  console.log(`Uploaded Chrome extension ${upload.crxVersion || ''}`.trim());

  if (command === 'upload') return upload;

  const publish = await client.publish({
    publishType: normalizePublishType(options.type),
    deployPercentage: Number(options.percentage ?? 100),
  });
  const warningCount = publish.warningInfo?.warnings?.length || 0;

  console.log(`Chrome Web Store submission state: ${publish.state}`);
  await writeGitHubSummary([
    '## Chrome Web Store',
    '',
    `- Version: \`${upload.crxVersion || 'unknown'}\``,
    `- Upload: \`${upload.uploadState}\``,
    `- Submission: \`${publish.state}\``,
    `- Warnings: \`${warningCount}\``,
  ]);

  return { upload, publish };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  runCli(process.argv.slice(2)).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Chrome Web Store error: ${message}`);
    process.exitCode = 1;
  });
}
