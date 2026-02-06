// Editor Manager - detects and manages markdown editors across sites

type EditorCallback = (editor: HTMLTextAreaElement, event: 'added' | 'removed') => void;

// Detect current site
function getCurrentSite(): 'github' | 'gitlab' | 'reddit' | 'unknown' {
  const hostname = window.location.hostname;
  if (hostname === 'github.com') return 'github';
  if (hostname === 'gitlab.com' || hostname.endsWith('.gitlab.io')) return 'gitlab';
  if (hostname.endsWith('reddit.com')) return 'reddit';
  return 'unknown';
}

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

// Reddit uses contenteditable - requires different handling
// For now, we'll try to detect markdown mode textareas
const REDDIT_EDITOR_SELECTORS = [
  // Markdown mode textarea (when user switches from fancy pants editor)
  'textarea[placeholder*="markdown"]',
  'textarea[data-testid="markdown-textarea"]',
  // Old Reddit uses textareas
  'textarea.usertext-edit',
  'textarea[name="text"]',
  // Comment textareas
  'textarea.c-form-control',
];

// Get selectors based on current site
function getSelectorsForSite(): string[] {
  const site = getCurrentSite();
  switch (site) {
    case 'github':
      return GITHUB_EDITOR_SELECTORS;
    case 'gitlab':
      return GITLAB_EDITOR_SELECTORS;
    case 'reddit':
      return REDDIT_EDITOR_SELECTORS;
    default:
      // Return all selectors for unknown sites
      return [
        ...GITHUB_EDITOR_SELECTORS,
        ...GITLAB_EDITOR_SELECTORS,
        ...REDDIT_EDITOR_SELECTORS,
      ];
  }
}

const COMBINED_SELECTOR = [
  ...GITHUB_EDITOR_SELECTORS,
  ...GITLAB_EDITOR_SELECTORS,
  ...REDDIT_EDITOR_SELECTORS,
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

    // Notify removal of all editors
    for (const editor of this.knownEditors) {
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
    // Mark as known
    this.knownEditors.add(editor);

    // Mark with data attribute to avoid double-processing
    editor.dataset.rumdlManaged = 'true';

    // Notify callback
    this.callback?.(editor, 'added');

    const site = getCurrentSite();
    console.log(`[rumdl] New editor detected on ${site}:`, editor.name || editor.id || 'unnamed');
  }

  private handleRemovedEditor(editor: HTMLTextAreaElement): void {
    if (!this.knownEditors.has(editor)) return;

    this.knownEditors.delete(editor);
    this.observers.get(editor)?.disconnect();
    this.observers.delete(editor);

    // Remove marker
    delete editor.dataset.rumdlManaged;

    // Notify callback
    this.callback?.(editor, 'removed');

    console.log('[rumdl] Editor removed:', editor.name || editor.id || 'unnamed');
  }
}
