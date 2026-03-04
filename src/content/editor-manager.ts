// Editor Manager - detects and manages markdown editors across sites

// Debug mode - set to false for production
const DEBUG = false;

function log(...args: unknown[]): void {
  if (DEBUG) console.log('[rumdl:editor]', ...args);
}

type EditorCallback = (editor: HTMLTextAreaElement, event: 'added' | 'removed') => void;

// Selectors for GitHub markdown editors
const GITHUB_EDITOR_SELECTORS = [
  // New GitHub UI (2024+)
  'textarea[aria-label="Markdown value"]',           // New markdown input component
  '.MarkdownInput-module__textArea__ textarea',      // MarkdownInput wrapper
  'textarea.prc-Textarea-TextArea-snlco',            // Primer React textarea class
  // Legacy selectors (still needed for some pages)
  'textarea[name$="[body]"]',           // Generic body fields (issues, PRs, etc.)
  'textarea[id*="comment"]',            // Comment fields
  'textarea[id*="new_comment"]',        // New comment fields
  'textarea.js-comment-field',          // JS-driven comment fields
  'textarea[data-paste-markdown]',      // Paste-enabled markdown fields
  'textarea.comment-form-textarea',     // Legacy comment forms
  'textarea.js-issue-body',             // Issue body (legacy)
  'textarea[name="wiki[body]"]',        // Wiki editor
  'textarea[name="discussion[body]"]',  // Discussions
];

// Selectors for GitLab markdown editors
const GITLAB_EDITOR_SELECTORS = [
  // Issue and MR descriptions
  'textarea[data-qa-selector="markdown_editor"]',
  'textarea.note-textarea',
  'textarea#note-body',
  'textarea.js-markdown-area',
  // Wiki and snippet editors
  'textarea[name="wiki[content]"]',
  'textarea[name="content"]',
  // Comment fields
  'textarea[name*="[note]"]',
  'textarea.js-gfm-input',
  // Generic markdown textareas
  'textarea[data-supports-quick-actions]',
  'textarea.js-vue-markdown-field',
];

const COMBINED_SELECTOR = [
  ...GITHUB_EDITOR_SELECTORS,
  ...GITLAB_EDITOR_SELECTORS,
].join(', ');

export class EditorManager {
  private observers: Map<HTMLTextAreaElement, MutationObserver> = new Map();
  private knownEditors: Set<HTMLTextAreaElement> = new Set();
  private callback: EditorCallback | null = null;
  private documentObserver: MutationObserver | null = null;

  /**
   * Start observing for markdown editors
   */
  observe(callback: EditorCallback): void {
    log('EditorManager.observe() starting');
    this.callback = callback;

    // Find existing editors
    this.scanForEditors();

    // Watch for new editors being added to the DOM
    this.documentObserver = new MutationObserver((mutations) => {
      let shouldScan = false;

      for (const mutation of mutations) {
        // Check added nodes
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;

            // Check if the added node is an editor
            if (element.matches && element.matches(COMBINED_SELECTOR)) {
              shouldScan = true;
              break;
            }

            // Check if any children are editors
            if (element.querySelector && element.querySelector(COMBINED_SELECTOR)) {
              shouldScan = true;
              break;
            }
          }
        }

        // Check removed nodes
        for (const node of mutation.removedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;

            // Check if the removed node is an editor
            if (element.matches && element.matches(COMBINED_SELECTOR)) {
              this.handleRemovedEditor(element as HTMLTextAreaElement);
            }

            // Check if any children are editors
            if (element.querySelectorAll) {
              const editors = element.querySelectorAll<HTMLTextAreaElement>(COMBINED_SELECTOR);
              editors.forEach(editor => this.handleRemovedEditor(editor));
            }
          }
        }

        if (shouldScan) break;
      }

      if (shouldScan) {
        this.scanForEditors();
      }
    });

    this.documentObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Stop observing
   */
  disconnect(): void {
    this.documentObserver?.disconnect();
    this.documentObserver = null;

    for (const observer of this.observers.values()) {
      observer.disconnect();
    }
    this.observers.clear();

    // Clean up and notify removal of all editors
    for (const editor of this.knownEditors) {
      delete editor.dataset.rumdlManaged;
      this.callback?.(editor, 'removed');
    }
    this.knownEditors.clear();

    this.callback = null;
  }

  /**
   * Rescan for editors (useful after SPA navigation)
   */
  rescan(): void {
    // Remove editors that are no longer in the DOM
    for (const editor of this.knownEditors) {
      if (!document.contains(editor)) {
        this.handleRemovedEditor(editor);
      }
    }

    // Find new editors
    this.scanForEditors();
  }

  /**
   * Get all currently tracked editors
   */
  getEditors(): HTMLTextAreaElement[] {
    return Array.from(this.knownEditors);
  }

  private scanForEditors(): void {
    const editors = document.querySelectorAll<HTMLTextAreaElement>(COMBINED_SELECTOR);

    for (const editor of editors) {
      if (!this.knownEditors.has(editor)) {
        this.handleNewEditor(editor);
      }
    }
  }

  private handleNewEditor(editor: HTMLTextAreaElement): void {
    log('handleNewEditor called for:', editor.placeholder || editor.name || editor.id || 'unnamed');

    this.knownEditors.add(editor);
    editor.dataset.rumdlManaged = 'true';

    this.callback?.(editor, 'added');
    log('New editor detected:', editor.placeholder || editor.name || editor.id || 'unnamed');
  }

  private handleRemovedEditor(editor: HTMLTextAreaElement): void {
    if (!this.knownEditors.has(editor)) return;

    this.knownEditors.delete(editor);
    this.observers.get(editor)?.disconnect();
    this.observers.delete(editor);

    delete editor.dataset.rumdlManaged;
    this.callback?.(editor, 'removed');

    log('Editor removed:', editor.name || editor.id || 'unnamed');
  }
}
