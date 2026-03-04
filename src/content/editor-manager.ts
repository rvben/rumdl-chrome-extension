// Editor Manager - detects and manages markdown editors across sites

import { getCurrentSite } from '../shared/site-utils.js';

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

// Reddit uses web components with Shadow DOM for the new editor
// We need special handling to query into shadow roots
const REDDIT_EDITOR_SELECTORS = [
  // Old Reddit uses textareas (still works with regular selectors)
  'textarea.usertext-edit',
  'textarea[name="text"]',
  'textarea.c-form-control',
];

// Reddit web components that contain textareas in shadow DOM
const REDDIT_SHADOW_COMPONENTS = [
  'shreddit-markdown-composer',
  'shreddit-composer',
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
  private shadowObservers: Map<Element, MutationObserver> = new Map();
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

            // Check for Reddit shadow DOM components
            const site = getCurrentSite();
            if (site === 'reddit') {
              for (const componentSelector of REDDIT_SHADOW_COMPONENTS) {
                if (element.matches && element.matches(componentSelector)) {
                  shouldScan = true;
                  break;
                }
                if (element.querySelector && element.querySelector(componentSelector)) {
                  shouldScan = true;
                  break;
                }
              }
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

    // Clean up shadow root observers
    for (const observer of this.shadowObservers.values()) {
      observer.disconnect();
    }
    this.shadowObservers.clear();

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
    // For shadow DOM editors, check if their host component still exists
    for (const editor of this.knownEditors) {
      const isInDOM = document.contains(editor);
      const isInShadowDOM = this.isEditorInShadowDOM(editor);

      if (!isInDOM && !isInShadowDOM) {
        this.handleRemovedEditor(editor);
      }
    }

    // Clean up shadow observers for removed components
    for (const [component, observer] of this.shadowObservers) {
      if (!document.contains(component)) {
        observer.disconnect();
        this.shadowObservers.delete(component);
      }
    }

    // Find new editors
    this.scanForEditors();
  }

  private isEditorInShadowDOM(editor: HTMLTextAreaElement): boolean {
    // Check if editor is inside a shadow root of a known component
    const rootNode = editor.getRootNode();
    if (rootNode instanceof ShadowRoot) {
      const host = rootNode.host;
      return document.contains(host);
    }
    return false;
  }

  /**
   * Get all currently tracked editors
   */
  getEditors(): HTMLTextAreaElement[] {
    return Array.from(this.knownEditors);
  }

  private scanForEditors(): void {
    // Scan regular DOM for editors
    const editors = document.querySelectorAll<HTMLTextAreaElement>(COMBINED_SELECTOR);

    for (const editor of editors) {
      if (!this.knownEditors.has(editor)) {
        this.handleNewEditor(editor);
      }
    }

    // Scan Shadow DOM for Reddit editors
    const site = getCurrentSite();
    if (site === 'reddit') {
      this.scanRedditShadowDOM();
    }
  }

  private scanRedditShadowDOM(): void {
    log('Scanning Reddit shadow DOM...');
    for (const componentSelector of REDDIT_SHADOW_COMPONENTS) {
      const components = document.querySelectorAll(componentSelector);
      log(`Found ${components.length} ${componentSelector} components`);

      for (const component of components) {
        this.scanShadowRootRecursively(component);
      }
    }
  }

  private scanShadowRootRecursively(element: Element, depth: number = 0): void {
    if (depth > 5) return; // Prevent infinite recursion

    const shadowRoot = element.shadowRoot;
    if (!shadowRoot) return;

    log(`Scanning shadow root of <${element.tagName.toLowerCase()}> (depth ${depth})`);

    // Look for textareas directly in this shadow root
    const textareas = shadowRoot.querySelectorAll<HTMLTextAreaElement>('textarea');
    log(`Found ${textareas.length} textareas at depth ${depth}`);

    for (const textarea of textareas) {
      if (!this.knownEditors.has(textarea)) {
        log('Found textarea:', textarea.placeholder || textarea.name || 'unnamed');
        this.handleNewEditor(textarea);
      }
    }

    // Set up observer on this shadow root
    if (!this.shadowObservers.has(element)) {
      this.observeShadowRoot(element, shadowRoot);
    }

    // Recursively search nested web components with shadow roots
    const nestedComponents = shadowRoot.querySelectorAll('*');
    for (const nested of nestedComponents) {
      if (nested.shadowRoot) {
        this.scanShadowRootRecursively(nested, depth + 1);
      }
    }
  }

  private observeShadowRoot(component: Element, shadowRoot: ShadowRoot): void {
    log(`Observing <${component.tagName.toLowerCase()}>`);

    const observer = new MutationObserver(() => {
      // Check for textareas inside shadow DOM
      const textareas = shadowRoot.querySelectorAll<HTMLTextAreaElement>('textarea');
      for (const textarea of textareas) {
        if (!this.knownEditors.has(textarea)) {
          this.handleNewEditor(textarea);
        }
      }

      // Also check for new nested shadow roots
      const nestedComponents = shadowRoot.querySelectorAll('*');
      for (const nested of nestedComponents) {
        if (nested.shadowRoot && !this.shadowObservers.has(nested)) {
          this.scanShadowRootRecursively(nested, 1);
        }
      }
    });

    observer.observe(shadowRoot, {
      childList: true,
      subtree: true
    });

    this.shadowObservers.set(component, observer);
  }

  private handleNewEditor(editor: HTMLTextAreaElement): void {
    log('handleNewEditor called for:', editor.placeholder || editor.name || editor.id || 'unnamed');

    // Mark as known
    this.knownEditors.add(editor);

    // Mark with data attribute to avoid double-processing
    editor.dataset.rumdlManaged = 'true';

    // Notify callback
    log('Callback exists:', !!this.callback);
    this.callback?.(editor, 'added');

    log('New editor detected:', editor.placeholder || editor.name || editor.id || 'unnamed');
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

    log('Editor removed:', editor.name || editor.id || 'unnamed');
  }
}
