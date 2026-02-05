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

export class KeyboardShortcuts {
  private handler: ShortcutHandler | null = null;
  private boundKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  private activeTextarea: HTMLTextAreaElement | null = null;

  /**
   * Register keyboard shortcuts for a textarea
   */
  register(textarea: HTMLTextAreaElement, handler: ShortcutHandler): void {
    this.handler = handler;
    this.activeTextarea = textarea;

    this.boundKeyHandler = (e: KeyboardEvent) => {
      // Only handle if the textarea is focused
      if (document.activeElement !== textarea) return;

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
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
          this.handler?.(shortcut.action, textarea);
          return;
        }
      }
    };

    textarea.addEventListener('keydown', this.boundKeyHandler);
  }

  /**
   * Unregister keyboard shortcuts
   */
  unregister(textarea: HTMLTextAreaElement): void {
    if (this.boundKeyHandler) {
      textarea.removeEventListener('keydown', this.boundKeyHandler);
      this.boundKeyHandler = null;
    }
    this.handler = null;
    this.activeTextarea = null;
  }

  /**
   * Get all shortcut definitions for display
   */
  static getShortcuts(): Array<{ keys: string; description: string }> {
    const isMac = typeof navigator !== 'undefined' &&
                  navigator.platform.toUpperCase().indexOf('MAC') >= 0;
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
