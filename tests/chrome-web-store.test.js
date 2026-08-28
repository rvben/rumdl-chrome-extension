import { describe, expect, it, vi } from 'vitest';
import {
  ChromeWebStoreError,
  assertHealthyStatus,
  assertReleaseVersion,
  createChromeWebStoreClient,
  waitForUpload,
} from '../scripts/chrome-web-store.mjs';

const credentials = {
  accessToken: 'short-lived-test-token',
  publisherId: 'publisher-id',
  extensionId: 'abcdefghijklmnopabcdefghijklmnop',
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Chrome Web Store API client', () => {
  it('fetches status from the v2 item endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      itemId: credentials.extensionId,
      submittedItemRevisionStatus: { state: 'PENDING_REVIEW' },
    }));
    const client = createChromeWebStoreClient({ ...credentials, fetchImpl });

    await expect(client.status()).resolves.toMatchObject({
      submittedItemRevisionStatus: { state: 'PENDING_REVIEW' },
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://chromewebstore.googleapis.com/v2/publishers/publisher-id/items/${credentials.extensionId}:fetchStatus`,
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
      }),
    );
  });

  it('uploads the ZIP as application/zip', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      itemId: credentials.extensionId,
      crxVersion: '1.0.2',
      uploadState: 'SUCCEEDED',
    }));
    const client = createChromeWebStoreClient({ ...credentials, fetchImpl });
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

    await expect(client.upload(zip)).resolves.toMatchObject({ uploadState: 'SUCCEEDED' });
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://chromewebstore.googleapis.com/upload/v2/publishers/publisher-id/items/${credentials.extensionId}:upload`,
      expect.objectContaining({
        method: 'POST',
        body: zip,
        headers: expect.objectContaining({ 'Content-Type': 'application/zip' }),
      }),
    );
  });

  it('publishes automatically with warnings treated as blocking', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ state: 'PENDING_REVIEW' }));
    const client = createChromeWebStoreClient({ ...credentials, fetchImpl });

    await expect(client.publish()).resolves.toEqual({ state: 'PENDING_REVIEW' });
    const request = fetchImpl.mock.calls[0][1];
    expect(JSON.parse(request.body)).toEqual({
      publishType: 'DEFAULT_PUBLISH',
      deployInfos: [{ deployPercentage: 100 }],
      skipReview: false,
      blockOnWarnings: true,
    });
  });

  it('polls an asynchronous upload until it succeeds', async () => {
    const client = {
      status: vi.fn()
        .mockResolvedValueOnce({ lastAsyncUploadState: 'IN_PROGRESS' })
        .mockResolvedValueOnce({ lastAsyncUploadState: 'SUCCEEDED' }),
    };
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(waitForUpload(client, { uploadState: 'IN_PROGRESS' }, {
      pollIntervalMs: 0,
      timeoutMs: 1_000,
      sleep,
    })).resolves.toBe('SUCCEEDED');
    expect(client.status).toHaveBeenCalledTimes(2);
  });

  it('fails closed when Google rejects an upload', async () => {
    const client = { status: vi.fn() };

    await expect(waitForUpload(client, { uploadState: 'FAILED' }))
      .rejects.toThrow('Extension upload failed with state: FAILED');
  });

  it('surfaces API errors without including the access token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      error: { message: 'Permission denied' },
    }, 403));
    const client = createChromeWebStoreClient({ ...credentials, fetchImpl });

    const error = await client.status().catch((caught) => caught);
    expect(error).toBeInstanceOf(ChromeWebStoreError);
    expect(error.message).toContain('Permission denied');
    expect(error.message).not.toContain(credentials.accessToken);
  });

  it('requires the tag, manifest, and package versions to match', () => {
    expect(assertReleaseVersion('v1.0.2', '1.0.2', '1.0.2')).toBe('1.0.2');
    expect(() => assertReleaseVersion('v1.0.2', '1.0.1', '1.0.2'))
      .toThrow('Version mismatch');
  });

  it('fails health checks for rejection or policy enforcement', () => {
    expect(assertHealthyStatus({
      submittedItemRevisionStatus: { state: 'PENDING_REVIEW' },
      warned: false,
      takenDown: false,
    })).toMatchObject({ submittedItemRevisionStatus: { state: 'PENDING_REVIEW' } });

    expect(() => assertHealthyStatus({
      submittedItemRevisionStatus: { state: 'REJECTED' },
    })).toThrow('submission was rejected');
    expect(() => assertHealthyStatus({ warned: true }))
      .toThrow('unresolved policy warning');
    expect(() => assertHealthyStatus({ takenDown: true }))
      .toThrow('taken down');
  });
});
