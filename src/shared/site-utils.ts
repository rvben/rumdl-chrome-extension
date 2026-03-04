// Site detection utilities

export type SiteName = 'github' | 'gitlab' | 'unknown';

/**
 * Detect current site from hostname
 */
export function getCurrentSite(): SiteName {
  const hostname = window.location.hostname;
  if (hostname === 'github.com') return 'github';
  if (hostname === 'gitlab.com' || hostname.endsWith('.gitlab.io')) return 'gitlab';
  return 'unknown';
}
