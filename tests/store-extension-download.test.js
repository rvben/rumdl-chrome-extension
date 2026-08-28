import { describe, expect, it } from 'vitest';
import {
  assertSafeArchiveEntries,
  buildStoreDownloadUrl,
  extractCrx3Zip,
  validateExtensionId,
} from '../scripts/download-store-extension.mjs';

const extensionId = 'abcdefghijklmnopabcdefghijklmnop';

describe('Chrome Web Store package download', () => {
  it('builds a request for the requested extension only', () => {
    const url = buildStoreDownloadUrl(extensionId, '140.0.0.0');
    expect(url.origin).toBe('https://clients2.google.com');
    expect(url.pathname).toBe('/service/update2/crx');
    expect(url.searchParams.get('response')).toBe('redirect');
    expect(url.searchParams.get('acceptformat')).toBe('crx3');
    expect(url.searchParams.get('x')).toBe(`id=${extensionId}&uc`);
  });

  it('rejects malformed extension IDs', () => {
    expect(validateExtensionId(extensionId)).toBe(extensionId);
    expect(() => validateExtensionId('not-an-extension-id')).toThrow('32 letters');
  });

  it('extracts the ZIP payload from a CRX3 package', () => {
    const header = Buffer.from([1, 2, 3, 4]);
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 5, 6]);
    const fixedHeader = Buffer.alloc(12);
    fixedHeader.write('Cr24', 0, 'ascii');
    fixedHeader.writeUInt32LE(3, 4);
    fixedHeader.writeUInt32LE(header.length, 8);

    expect(extractCrx3Zip(Buffer.concat([fixedHeader, header, zip]))).toEqual(zip);
  });

  it('rejects invalid or unsupported packages', () => {
    expect(() => extractCrx3Zip(Buffer.from('not a crx package'))).toThrow('valid CRX header');

    const crx2 = Buffer.alloc(16);
    crx2.write('Cr24', 0, 'ascii');
    crx2.writeUInt32LE(2, 4);
    expect(() => extractCrx3Zip(crx2)).toThrow('not a CRX3');
  });

  it('rejects paths that could escape the extraction directory', () => {
    expect(assertSafeArchiveEntries(['manifest.json', 'dist/content.js']))
      .toEqual(['manifest.json', 'dist/content.js']);
    expect(() => assertSafeArchiveEntries(['../outside.txt'])).toThrow('unsafe path');
    expect(() => assertSafeArchiveEntries(['/absolute.txt'])).toThrow('unsafe path');
    expect(() => assertSafeArchiveEntries(['..\\outside.txt'])).toThrow('unsafe path');
  });
});
