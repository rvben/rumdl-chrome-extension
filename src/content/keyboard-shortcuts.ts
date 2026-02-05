// Keyboard Shortcuts - keyboard commands for rumdl actions

export type ShortcutAction = 'format' | 'togglePanel' | 'nextWarning' | 'prevWarning' | 'fixCurrent';

export interface ShortcutHandler {
  (action: ShortcutAction, textarea: HTMLTextAreaElement): void;
}

interface ShortcutDefinition {
  key: string;
  ctrlOrCmd: boolean;
  shift: boolean;
  alt: boolean;
  action: ShortcutAction;
  description: string;
}

// Default shortcuts
const SHORTCUTS: ShortcutDefinition[] = [
  {
    key: 'f',
    ctrlOrCmd: true,
    shift: true,
    alt: false,
    action: 'format',
    description: 'Format document (fix all issues)'
  },
  {
    key: 'l',
    ctrlOrCmd: true,
    shift: true,
    alt: false,
    action: 'togglePanel',
    description: 'Toggle warnings panel'
  },
  {
    key: ']',
    ctrlOrCmd: true,
    shift: false,
    alt: true,
    action: 'nextWarning',
    description: 'Go to next warning'
  },
  {
    key: '[',
    ctrlOrCmd: true,
    shift: false,
    alt: true,
    action: 'prevWarning',
    description: 'Go to previous warning'
  },
  {
    key: '.',
    ctrlOrCmd: true,
    shift: false,
    alt: false,
    action: 'fixCurrent',
    description: 'Quick fix at cursor'
  }
];

// Type for Navigator.userAgentData (not in all TS versions)
interface NavigatorUAData {
  platform?: string;
}

declare global {
  interface Navigator {
    userAgentData?: NavigatorUAData;
  }
}

/**
 * Detect if running on macOS using modern APIs with fallback
 */
function isMacOS(): boolean {
  // Modern API (Chromium 90+)
  if (navigator.userAgentData?.platform) {
    return navigator.userAgentData.platform.toLowerCase() === 'macos';
  }
  // Fallback for older browsers
  return /mac/i.test(navigator.platform || '');
}

interface RegisteredHandler {
  handler: ShortcutHandler;
  keydownListener: (e: KeyboardEvent) => void;
}

export class KeyboardShortcuts {
  // Track handlers per textarea to avoid memory leaks
  private registeredHandlers = new Map<HTMLTextAreaElement, RegisteredHandler>();

  /**
   * Register keyboard shortcuts for a textarea
   */
  register(textarea: HTMLTextAreaElement, handler: ShortcutHandler): void {
    // Clean up existing handler if any
    this.unregister(textarea);

    const keydownListener = (e: KeyboardEvent) => {
      // Only handle if the textarea is focused
      if (document.activeElement !== textarea) return;

      const isMac = isMacOS();
      const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

      for (const shortcut of SHORTCUTS) {
        if (
          e.key.toLowerCase() === shortcut.key.toLowerCase() &&
          ctrlOrCmd === shortcut.ctrlOrCmd &&
          e.shiftKey === shortcut.shift &&
          e.altKey === shortcut.alt
        ) {
          e.preventDefault();
          e.stopPropagation();
          handler(shortcut.action, textarea);
          return;
        }
      }
    };

    textarea.addEventListener('keydown', keydownListener);
    this.registeredHandlers.set(textarea, { handler, keydownListener });
  }

  /**
   * Unregister keyboard shortcuts for a specific textarea
   */
  unregister(textarea: HTMLTextAreaElement): void {
    const registered = this.registeredHandlers.get(textarea);
    if (registered) {
      textarea.removeEventListener('keydown', registered.keydownListener);
      this.registeredHandlers.delete(textarea);
    }
  }

  /**
   * Unregister all keyboard shortcuts (cleanup on page unload)
   */
  unregisterAll(): void {
    for (const [textarea, registered] of this.registeredHandlers) {
      textarea.removeEventListener('keydown', registered.keydownListener);
    }
    this.registeredHandlers.clear();
  }

  /**
   * Get all shortcut definitions for display
   */
  static getShortcuts(): Array<{ keys: string; description: string }> {
    const isMac = isMacOS();
    const cmdKey = isMac ? '⌘' : 'Ctrl';

    return SHORTCUTS.map(s => {
      const keys: string[] = [];
      if (s.ctrlOrCmd) keys.push(cmdKey);
      if (s.shift) keys.push('Shift');
      if (s.alt) keys.push(isMac ? '⌥' : 'Alt');
      keys.push(s.key.toUpperCase());

      return {
        keys: keys.join('+'),
        description: s.description
      };
    });
  }
}
