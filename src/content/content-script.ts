// Content script for rumdl GitHub extension
// Manages editor detection, linting, and UI overlays

import { EditorManager } from './editor-manager.js';
import { LintOverlay } from './lint-overlay.js';
import { GutterMarkers } from './gutter-markers.js';
import { WarningPanel } from './warning-panel.js';
import { KeyboardShortcuts, ShortcutAction } from './keyboard-shortcuts.js';
import { showTooltip, hideTooltip, destroyTooltip } from './tooltip.js';
import { lint, fix, getConfig, ping } from '../shared/messages.js';
import type { LintWarning, RumdlConfig, LinterConfig } from '../shared/types.js';

// Global state
let config: RumdlConfig | null = null;
const editorManager = new EditorManager();
const lintOverlay = new LintOverlay();
const gutterMarkers = new GutterMarkers();
const keyboardShortcuts = new KeyboardShortcuts();

// Map of textarea to its state
interface EditorState {
  overlay: HTMLElement;
  gutter: HTMLElement | null;
  panel: WarningPanel;
  debounceTimer: number | null;
  lastContent: string;
  lastContentHash: string;
  warnings: LintWarning[];
  button: HTMLElement | null;
  currentWarningIndex: number;
  lintTime: number;
  isPanelVisible: boolean;
}

const editorStates = new Map<HTMLTextAreaElement, EditorState>();

// Debounce delay for linting (ms)
const LINT_DEBOUNCE_MS = 150;

/**
 * Initialize the extension
 */
async function init(): Promise<void> {
  console.log('[rumdl] Initializing content script...');

  // Wait for service worker to be ready
  let ready = false;
  for (let i = 0; i < 10; i++) {
    ready = await ping();
    if (ready) break;
    await new Promise(r => setTimeout(r, 100));
  }

  if (!ready) {
    console.error('[rumdl] Service worker not responding');
    return;
  }

  // Load configuration
  try {
    config = await getConfig();
    console.log('[rumdl] Config loaded:', config);
  } catch (error) {
    console.error('[rumdl] Failed to load config:', error);
    return;
  }

  if (!config.enabled) {
    console.log('[rumdl] Extension is disabled');
    return;
  }

  // Start observing for editors
  editorManager.observe((textarea, event) => {
    if (event === 'added') {
      setupEditor(textarea);
    } else {
      cleanupEditor(textarea);
    }
  });

  // Handle GitHub's SPA navigation
  document.addEventListener('turbo:load', handleNavigation);
  document.addEventListener('pjax:end', handleNavigation);

  // Listen for config changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.rumdl_config) {
      config = changes.rumdl_config.newValue;
      console.log('[rumdl] Config updated:', config);
      // Re-lint all editors with new config
      for (const textarea of editorStates.keys()) {
        performLint(textarea);
      }
    }
  });

  console.log('[rumdl] Content script initialized');
}

/**
 * Handle SPA navigation events
 */
function handleNavigation(): void {
  console.log('[rumdl] Navigation detected, rescanning for editors...');
  editorManager.rescan();
}

/**
 * Set up linting for a textarea
 */
function setupEditor(textarea: HTMLTextAreaElement): void {
  if (editorStates.has(textarea)) return;

  console.log('[rumdl] Setting up editor:', textarea.name || textarea.id);

  // Create overlay
  const overlay = lintOverlay.createOverlay(textarea);

  // Create gutter if enabled
  let gutter: HTMLElement | null = null;
  if (config?.showGutterIcons) {
    gutter = gutterMarkers.createGutter(textarea);
  }

  // Create warning panel
  const panel = new WarningPanel();

  // Create lint button
  const button = createLintButton(textarea);

  // Store state
  const state: EditorState = {
    overlay,
    gutter,
    panel,
    debounceTimer: null,
    lastContent: '',
    lastContentHash: '',
    warnings: [],
    button,
    currentWarningIndex: -1,
    lintTime: 0,
    isPanelVisible: false
  };
  editorStates.set(textarea, state);

  // Add input listener with debounce
  textarea.addEventListener('input', () => scheduleLint(textarea));

  // Add focus listener to show panel
  textarea.addEventListener('focus', () => {
    if (state.warnings.length > 0 && config) {
      // Don't auto-show, user can use keyboard shortcut
    }
  });

  // Add paste handler for format on paste
  textarea.addEventListener('paste', (e) => handlePaste(e, textarea));

  // Register keyboard shortcuts
  keyboardShortcuts.register(textarea, (action, ta) => handleShortcut(action, ta));

  // Set up hover tooltips for markers
  setupMarkerTooltips(overlay, textarea);

  // Initial lint
  performLint(textarea);
}

/**
 * Clean up when a textarea is removed
 */
function cleanupEditor(textarea: HTMLTextAreaElement): void {
  const state = editorStates.get(textarea);
  if (!state) return;

  console.log('[rumdl] Cleaning up editor:', textarea.name || textarea.id);

  // Cancel pending lint
  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer);
  }

  // Remove UI elements
  lintOverlay.removeOverlay(textarea);
  if (state.gutter) {
    gutterMarkers.removeGutter(textarea);
  }
  state.panel.destroy();
  state.button?.remove();

  // Unregister shortcuts
  keyboardShortcuts.unregister(textarea);

  // Clean up tooltips
  destroyTooltip();

  editorStates.delete(textarea);
}

/**
 * Schedule a lint operation (debounced)
 */
function scheduleLint(textarea: HTMLTextAreaElement): void {
  const state = editorStates.get(textarea);
  if (!state) return;

  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer);
  }

  state.debounceTimer = window.setTimeout(() => {
    performLint(textarea);
  }, LINT_DEBOUNCE_MS);
}

/**
 * Simple hash function for content comparison
 */
function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}

/**
 * Perform linting on a textarea
 */
async function performLint(textarea: HTMLTextAreaElement): Promise<void> {
  const state = editorStates.get(textarea);
  if (!state || !config) return;

  const content = textarea.value;
  const contentHash = hashContent(content);

  // Skip if content hasn't changed
  if (contentHash === state.lastContentHash) return;
  state.lastContent = content;
  state.lastContentHash = contentHash;

  // Skip empty content
  if (!content.trim()) {
    state.warnings = [];
    state.lintTime = 0;
    lintOverlay.clear(state.overlay);
    if (state.gutter) gutterMarkers.clear(state.gutter);
    state.panel.updateWarnings([], 0);
    updateButton(state.button, 0, 0);
    return;
  }

  try {
    const startTime = performance.now();
    const linterConfig = toLinterConfig(config);
    const warnings = await lint(content, linterConfig);
    const lintTime = performance.now() - startTime;

    state.warnings = warnings;
    state.lintTime = lintTime;

    // Update UI
    if (config.showInlineMarkers) {
      lintOverlay.render(state.overlay, textarea, warnings);
    } else {
      lintOverlay.clear(state.overlay);
    }

    if (state.gutter && config.showGutterIcons) {
      gutterMarkers.render(state.gutter, textarea, warnings);
    }

    state.panel.updateWarnings(warnings, lintTime);
    updateButton(state.button, warnings.length, lintTime);

    console.log(`[rumdl] Lint complete: ${warnings.length} warning(s) in ${lintTime.toFixed(1)}ms`);
  } catch (error) {
    console.error('[rumdl] Lint failed:', error);
  }
}

/**
 * Handle keyboard shortcuts
 */
async function handleShortcut(action: ShortcutAction, textarea: HTMLTextAreaElement): Promise<void> {
  const state = editorStates.get(textarea);
  if (!state || !config) return;

  switch (action) {
    case 'format':
      await formatDocument(textarea);
      break;

    case 'togglePanel':
      if (state.isPanelVisible) {
        state.panel.hide();
        state.isPanelVisible = false;
      } else {
        state.panel.show(textarea, toLinterConfig(config));
        state.panel.updateWarnings(state.warnings, state.lintTime);
        state.isPanelVisible = true;
      }
      break;

    case 'nextWarning':
      navigateWarning(textarea, 1);
      break;

    case 'prevWarning':
      navigateWarning(textarea, -1);
      break;

    case 'fixCurrent':
      fixAtCursor(textarea);
      break;
  }
}

/**
 * Format the entire document
 */
async function formatDocument(textarea: HTMLTextAreaElement): Promise<void> {
  if (!config) return;

  try {
    const linterConfig = toLinterConfig(config);
    const fixed = await fix(textarea.value, linterConfig);
    if (fixed !== textarea.value) {
      const cursorPos = textarea.selectionStart;
      textarea.value = fixed;
      // Try to maintain cursor position
      textarea.selectionStart = Math.min(cursorPos, fixed.length);
      textarea.selectionEnd = textarea.selectionStart;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  } catch (error) {
    console.error('[rumdl] Format failed:', error);
  }
}

/**
 * Navigate to next/previous warning
 */
function navigateWarning(textarea: HTMLTextAreaElement, direction: 1 | -1): void {
  const state = editorStates.get(textarea);
  if (!state || state.warnings.length === 0) return;

  state.currentWarningIndex += direction;

  if (state.currentWarningIndex >= state.warnings.length) {
    state.currentWarningIndex = 0;
  } else if (state.currentWarningIndex < 0) {
    state.currentWarningIndex = state.warnings.length - 1;
  }

  const warning = state.warnings[state.currentWarningIndex];
  jumpToWarning(textarea, warning);
}

/**
 * Jump to a specific warning location
 */
function jumpToWarning(textarea: HTMLTextAreaElement, warning: LintWarning): void {
  const lines = textarea.value.split('\n');
  let pos = 0;
  for (let i = 0; i < warning.line - 1 && i < lines.length; i++) {
    pos += lines[i].length + 1;
  }
  pos += warning.column - 1;

  textarea.focus();
  textarea.setSelectionRange(pos, pos);

  // Scroll into view
  const lineHeight = 20;
  const scrollTop = (warning.line - 5) * lineHeight;
  textarea.scrollTop = Math.max(0, scrollTop);
}

/**
 * Fix warning at cursor position
 */
function fixAtCursor(textarea: HTMLTextAreaElement): void {
  const state = editorStates.get(textarea);
  if (!state) return;

  const cursorPos = textarea.selectionStart;

  // Find the line number at cursor
  const textBeforeCursor = textarea.value.substring(0, cursorPos);
  const cursorLine = textBeforeCursor.split('\n').length;

  // Find warnings on the current line with fixes
  const fixableWarnings = state.warnings.filter(
    w => w.line === cursorLine && w.fix
  );

  if (fixableWarnings.length === 0) return;

  // Apply the first fixable warning
  const warning = fixableWarnings[0];
  if (warning.fix) {
    const { start, end } = warning.fix.range;
    const { replacement } = warning.fix;

    const value = textarea.value;
    textarea.value = value.slice(0, start) + replacement + value.slice(end);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    // Adjust cursor position
    const newPos = start + replacement.length;
    textarea.setSelectionRange(newPos, newPos);
  }
}

/**
 * Handle paste event for format on paste
 */
async function handlePaste(e: ClipboardEvent, textarea: HTMLTextAreaElement): Promise<void> {
  if (!config?.autoFormat) return;

  // Get pasted text
  const pastedText = e.clipboardData?.getData('text');
  if (!pastedText) return;

  // Check if it looks like markdown
  const hasMarkdownSyntax = /^#+\s|^\s*[-*+]\s|^\s*\d+\.\s|```|^\s*>/.test(pastedText);
  if (!hasMarkdownSyntax) return;

  // Let the paste happen normally, then format
  setTimeout(async () => {
    await formatDocument(textarea);
  }, 0);
}

/**
 * Set up hover tooltips for lint markers
 */
function setupMarkerTooltips(overlay: HTMLElement, textarea: HTMLTextAreaElement): void {
  overlay.addEventListener('mouseover', (e) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains('rumdl-marker')) return;

    const state = editorStates.get(textarea);
    if (!state) return;

    // Find the warning for this marker
    const title = target.title;
    if (!title) return;

    // Parse the warning from the title
    const [ruleName, ...messageParts] = title.split(': ');
    const message = messageParts.join(': ');

    const warning = state.warnings.find(
      w => (w.rule_name || 'rumdl') === ruleName && w.message === message
    );

    if (warning) {
      const rect = target.getBoundingClientRect();
      showTooltip(warning, rect.left, rect.bottom);
    }
  });

  overlay.addEventListener('mouseout', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('rumdl-marker')) {
      hideTooltip();
    }
  });
}

/**
 * Convert RumdlConfig to LinterConfig
 */
function toLinterConfig(config: RumdlConfig): LinterConfig {
  const linterConfig: LinterConfig = {
    disable: config.disabledRules,
    'line-length': config.lineLength,
    flavor: config.flavor,
  };

  if (config.enabledRules.length > 0) {
    linterConfig.enable = config.enabledRules;
  }

  // Add rule-specific configs
  for (const [ruleName, ruleConfig] of Object.entries(config.ruleConfigs)) {
    linterConfig[ruleName] = ruleConfig;
  }

  return linterConfig;
}

/**
 * Create a lint status button near the textarea
 */
function createLintButton(textarea: HTMLTextAreaElement): HTMLElement | null {
  const form = textarea.closest('form');
  if (!form) return null;

  const toolbar = form.querySelector('.toolbar-commenting, .tabnav-tabs, .form-actions, .d-flex.flex-justify-end');
  if (!toolbar) return null;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'rumdl-status-btn';
  button.innerHTML = `
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
      <path d="M8 0a8 8 0 110 16A8 8 0 018 0zm0 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8 7a1 1 0 011 1v3a1 1 0 01-2 0V8a1 1 0 011-1zm0-3.5a1 1 0 110 2 1 1 0 010-2z"/>
    </svg>
    <span class="rumdl-status-count">0</span>
    <span class="rumdl-status-time"></span>
  `;
  button.title = 'rumdl: No issues';

  button.addEventListener('click', (e) => {
    e.preventDefault();
    const state = editorStates.get(textarea);
    if (state && config) {
      if (state.isPanelVisible) {
        state.panel.hide();
        state.isPanelVisible = false;
      } else {
        state.panel.show(textarea, toLinterConfig(config));
        state.panel.updateWarnings(state.warnings, state.lintTime);
        state.isPanelVisible = true;
      }
    }
  });

  if (toolbar.classList.contains('form-actions') || toolbar.classList.contains('d-flex')) {
    toolbar.insertBefore(button, toolbar.firstChild);
  } else {
    toolbar.appendChild(button);
  }

  return button;
}

/**
 * Update the lint status button
 */
function updateButton(button: HTMLElement | null, count: number, lintTime: number): void {
  if (!button) return;

  const countEl = button.querySelector('.rumdl-status-count');
  if (countEl) {
    countEl.textContent = count.toString();
  }

  const timeEl = button.querySelector('.rumdl-status-time');
  if (timeEl) {
    timeEl.textContent = lintTime > 0 ? `${lintTime.toFixed(0)}ms` : '';
  }

  button.title = count === 0
    ? `rumdl: No issues${lintTime > 0 ? ` (${lintTime.toFixed(0)}ms)` : ''}`
    : `rumdl: ${count} issue${count > 1 ? 's' : ''}${lintTime > 0 ? ` (${lintTime.toFixed(0)}ms)` : ''}`;

  button.classList.toggle('has-warnings', count > 0);
}

// Start the extension
init().catch(error => {
  console.error('[rumdl] Initialization failed:', error);
});
