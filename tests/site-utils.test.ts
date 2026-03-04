import { describe, it, expect, afterEach } from 'vitest';
import { getCurrentSite } from '../src/shared/site-utils';
import type { SiteName } from '../src/shared/site-utils';

function setHostname(hostname: string): void {
  Object.defineProperty(window, 'location', {
    value: { hostname },
    writable: true,
    configurable: true,
  });
}

describe('getCurrentSite', () => {
  afterEach(() => {
    // Reset to default
    setHostname('localhost');
  });

  it('detects github.com', () => {
    setHostname('github.com');
    expect(getCurrentSite()).toBe('github');
  });

  it('does not match github subdomains', () => {
    setHostname('api.github.com');
    expect(getCurrentSite()).toBe('unknown');
  });

  it('detects gitlab.com', () => {
    setHostname('gitlab.com');
    expect(getCurrentSite()).toBe('gitlab');
  });

  it('detects *.gitlab.io subdomains', () => {
    setHostname('myorg.gitlab.io');
    expect(getCurrentSite()).toBe('gitlab');
  });

  it('does not match gitlab subdomains (only .io)', () => {
    setHostname('ci.gitlab.com');
    expect(getCurrentSite()).toBe('unknown');
  });

  it('returns unknown for unrecognized sites', () => {
    setHostname('example.com');
    expect(getCurrentSite()).toBe('unknown');
  });

  it('returns unknown for localhost', () => {
    setHostname('localhost');
    expect(getCurrentSite()).toBe('unknown');
  });
});
