import { afterEach, describe, expect, it } from 'vitest';
import { KeyboardShortcuts } from '../src/content/keyboard-shortcuts';

const originalPlatform = Object.getOwnPropertyDescriptor(navigator, 'platform');

afterEach(() => {
  if (originalPlatform) {
    Object.defineProperty(navigator, 'platform', originalPlatform);
  }
  Object.defineProperty(navigator, 'userAgentData', {
    value: undefined,
    configurable: true,
  });
});

describe('KeyboardShortcuts display labels', () => {
  it('uses compact macOS symbols on macOS', () => {
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true });
    Object.defineProperty(navigator, 'userAgentData', { value: undefined, configurable: true });

    expect(KeyboardShortcuts.getShortcutKeys('format')).toBe('⌘⇧F');
    expect(KeyboardShortcuts.getShortcutKeys('nextWarning')).toBe('⌘⌥]');
  });

  it('uses explicit modifier names on other platforms', () => {
    Object.defineProperty(navigator, 'platform', { value: 'Linux x86_64', configurable: true });
    Object.defineProperty(navigator, 'userAgentData', { value: undefined, configurable: true });

    expect(KeyboardShortcuts.getShortcutKeys('format')).toBe('Ctrl+Shift+F');
    expect(KeyboardShortcuts.getShortcutKeys('nextWarning')).toBe('Ctrl+Alt+]');
  });
});
