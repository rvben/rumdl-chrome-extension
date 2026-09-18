import { afterEach, describe, expect, it, vi } from 'vitest';
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


describe('KeyboardShortcuts composition', () => {
  it('leaves IME composition and already handled keys alone', () => {
    const textarea = document.createElement('textarea');
    document.body.append(textarea);
    textarea.focus();
    Object.defineProperty(navigator, 'platform', { value: 'Linux', configurable: true });
    const shortcuts = new KeyboardShortcuts();
    const handler = vi.fn();
    shortcuts.register(textarea, handler);
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: '.', ctrlKey: true, isComposing: true, cancelable: true }));
    const handled = new KeyboardEvent('keydown', { key: '.', ctrlKey: true, cancelable: true });
    handled.preventDefault();
    textarea.dispatchEvent(handled);
    expect(handler).not.toHaveBeenCalled();
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: '.', ctrlKey: true, cancelable: true }));
    expect(handler).toHaveBeenCalledWith('fixCurrent', textarea);
    shortcuts.unregisterAll();
    textarea.remove();
  });
});
