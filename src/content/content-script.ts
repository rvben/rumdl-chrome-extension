// Content script for rumdl GitHub extension
// Manages editor detection, linting, and status UI

import { EditorManager } from './editor-manager.js';
import { WarningPanel } from './warning-panel.js';
import { KeyboardShortcuts, ShortcutAction } from './keyboard-shortcuts.js';
import { GutterMarkers } from './gutter-markers.js';
import { destroyTooltip } from './tooltip.js';
import { lint, fix, getConfig, ping, getStatus } from '../shared/messages.js';
import { showErrorNotification } from './error-notification.js';
import { toLinterConfig } from '../shared/config-utils.js';
import { validateAndMergeConfig } from '../shared/storage.js';
import type { LintWarning, RumdlConfig } from '../shared/types.js';

// Debug mode - set to false for production
const DEBUG = false;

function log(...args: unknown[]): void {
  if (DEBUG) console.log('[rumdl]', ...args);
}

function logError(...args: unknown[]): void {
  console.error('[rumdl]', ...args);
}

// Global state
let config: RumdlConfig | null = null;
const editorManager = new EditorManager();
const keyboardShortcuts = new KeyboardShortcuts();
const gutterMarkers = new GutterMarkers();

// Storage listener reference for cleanup
let storageListener: ((changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => void) | null = null;

// Map of textarea to its state
interface EditorState {
  panel: WarningPanel;
  gutter: HTMLElement;
  debounceTimer: ReturnType<typeof setTimeout> | null;
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

// Track service worker health for recovery
let serviceWorkerHealthy = false;
let lastServiceWorkerCheck = 0;
const SERVICE_WORKER_CHECK_INTERVAL = 30000; // 30 seconds

/**
 * Check service worker health and attempt recovery if needed
 */
async function checkServiceWorkerHealth(): Promise<boolean> {
  const now = Date.now();

  // Skip if we checked recently and it was healthy
  if (serviceWorkerHealthy && now - lastServiceWorkerCheck < SERVICE_WORKER_CHECK_INTERVAL) {
    return true;
  }

  lastServiceWorkerCheck = now;

  try {
    const ready = await ping();
    if (!ready) {
      serviceWorkerHealthy = false;
      return false;
    }

    // Check WASM status
    const status = await getStatus();
    if (!status.wasmInitialized) {
      serviceWorkerHealthy = false;
      if (status.wasmError) {
        showErrorNotification(
          'Linting unavailable',
          `WASM module failed to load: ${status.wasmError}`
        );
      }
      return false;
    }

    serviceWorkerHealthy = true;
    return true;
  } catch (error) {
    serviceWorkerHealthy = false;
    return false;
  }
}

/**
 * Initialize the extension
 */
async function init(): Promise<void> {
  console.log('[rumdl] Content script starting on', window.location.hostname);
  log('Initializing content script...');

  // Wait for service worker to be ready with retry
  let ready = false;
  for (let i = 0; i < 15; i++) {
    ready = await ping();
    if (ready) break;
    await new Promise(r => setTimeout(r, 200));
  }

  if (!ready) {
    logError('Service worker not responding after 3 seconds');
    showErrorNotification(
      'Extension failed to start',
      'Service worker not responding. Try reloading the page.'
    );
    return;
  }
  console.log('[rumdl] Service worker ready');

  // Check WASM health
  const status = await getStatus();
  if (!status.wasmInitialized) {
    logError('WASM not initialized:', status.wasmError);
    showErrorNotification(
      'Linting unavailable',
      status.wasmError || 'WASM module failed to initialize'
    );
    return;
  }
  console.log('[rumdl] WASM initialized, version:', status.version);
  serviceWorkerHealthy = true;

  // Load configuration
  try {
    config = await getConfig();
    console.log('[rumdl] Config loaded, enabled:', config.enabled);
  } catch (error) {
    logError('Failed to load config:', error);
    showErrorNotification('Failed to load configuration', String(error));
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

  // Handle SPA navigation for different sites
  // GitHub uses Turbo and pjax
  document.addEventListener('turbo:load', handleNavigation);
  document.addEventListener('pjax:end', handleNavigation);
  // GitLab uses Turbolinks
  document.addEventListener('turbolinks:load', handleNavigation);
  // Reddit uses React Router - we detect via popstate
  window.addEventListener('popstate', handleNavigation);

  // Listen for config changes (store reference for cleanup)
  storageListener = (changes, area) => {
    if (area === 'sync' && changes.rumdl_config) {
      config = validateAndMergeConfig(changes.rumdl_config.newValue);
      console.log('[rumdl] Config updated from storage:', config);
      // Update config on all panels and force re-lint all editors
      const linterConfig = toLinterConfig(config);
      for (const [textarea, state] of editorStates.entries()) {
        state.panel.updateConfig(linterConfig);
        // Clear content hash to force re-lint with new config
        state.lastContentHash = '';
        performLint(textarea);
      }
    }
  };
  chrome.storage.onChanged.addListener(storageListener);

  // Clean up on page unload
  window.addEventListener('beforeunload', cleanup);
  window.addEventListener('pagehide', cleanup);

  log('Content script initialized');
}

/**
 * Clean up all resources
 */
function cleanup(): void {
  log('Cleaning up all resources');

  // Clean up all editors
  for (const textarea of editorStates.keys()) {
    cleanupEditor(textarea);
  }

  // Disconnect editor manager
  editorManager.disconnect();

  // Unregister all keyboard shortcuts
  keyboardShortcuts.unregisterAll();

  // Remove storage listener
  if (storageListener) {
    chrome.storage.onChanged.removeListener(storageListener);
    storageListener = null;
  }

  // Remove navigation listeners
  document.removeEventListener('turbo:load', handleNavigation);
  document.removeEventListener('pjax:end', handleNavigation);
  document.removeEventListener('turbolinks:load', handleNavigation);
  window.removeEventListener('popstate', handleNavigation);

  // Destroy global tooltip
  destroyTooltip();
}

/**
 * Handle SPA navigation events
 */
function handleNavigation(): void {
  log('Navigation detected, rescanning for editors...');
  editorManager.rescan();
}

/**
 * Set up linting for a textarea
 */
function setupEditor(textarea: HTMLTextAreaElement): void {
  console.log('[rumdl] setupEditor called for:', textarea.placeholder || textarea.name || textarea.id || 'unnamed');

  if (editorStates.has(textarea)) {
    console.log('[rumdl] Editor already set up, skipping');
    return;
  }

  log('Setting up editor:', textarea.name || textarea.id);

  // Create warning panel
  const panel = new WarningPanel();
  console.log('[rumdl] Warning panel created');

  // Create gutter for inline markers
  const gutter = gutterMarkers.createGutter(textarea);
  console.log('[rumdl] Gutter created:', !!gutter);

  // Create status button in toolbar (or floating badge for shadow DOM)
  const isInShadowDOM = textarea.getRootNode() instanceof ShadowRoot;
  const button = isInShadowDOM ? createFloatingBadge(textarea) : createLintButton(textarea);
  console.log('[rumdl] Lint button/badge created:', !!button, isInShadowDOM ? '(floating)' : '(toolbar)');

  // Store state
  const state: EditorState = {
    panel,
    gutter,
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

  // Add paste handler for format on paste
  textarea.addEventListener('paste', (e) => handlePaste(e, textarea));

  // Register keyboard shortcuts
  keyboardShortcuts.register(textarea, (action, ta) => handleShortcut(action, ta));

  // Initial lint
  console.log('[rumdl] Starting initial lint');
  performLint(textarea);
  console.log('[rumdl] Editor setup complete');
}

/**
 * Clean up when a textarea is removed
 */
function cleanupEditor(textarea: HTMLTextAreaElement): void {
  const state = editorStates.get(textarea);
  if (!state) return;

  log('Cleaning up editor:', textarea.name || textarea.id);

  // Cancel pending lint
  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer);
  }

  // Remove UI elements
  state.panel.destroy();
  state.button?.remove();
  gutterMarkers.removeGutter(textarea);

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

  state.debounceTimer = setTimeout(() => {
    performLint(textarea);
  }, LINT_DEBOUNCE_MS);
}

/**
 * Hash function for content comparison that avoids collisions
 * Combines length, sample characters, and a rolling hash
 */
function hashContent(content: string): string {
  const len = content.length;

  // For very short content, just use the content itself
  if (len < 50) {
    return `${len}:${content}`;
  }

  // Rolling hash over entire content
  let hash = 0;
  for (let i = 0; i < len; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  // Sample characters from start, middle, and end for additional collision resistance
  const samples = [
    content.substring(0, 20),
    content.substring(Math.floor(len / 2) - 10, Math.floor(len / 2) + 10),
    content.substring(len - 20)
  ].join('|');

  return `${len}:${hash.toString(36)}:${samples.length}`;
}

/**
 * Get computed line height for a textarea
 */
function getLineHeight(textarea: HTMLTextAreaElement): number {
  const computedStyle = window.getComputedStyle(textarea);
  const lineHeight = parseFloat(computedStyle.lineHeight);
  // If lineHeight is NaN (e.g., 'normal'), estimate from font size
  if (isNaN(lineHeight)) {
    const fontSize = parseFloat(computedStyle.fontSize) || 14;
    return fontSize * 1.4; // Typical line-height ratio
  }
  return lineHeight;
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
    state.panel.updateWarnings([], 0);
    updateButton(state.button, 0, 0);
    gutterMarkers.clear(state.gutter);
    return;
  }

  try {
    // Check service worker health before linting
    const healthy = await checkServiceWorkerHealth();
    if (!healthy) {
      log('Service worker not healthy, skipping lint');
      return;
    }

    const startTime = performance.now();
    const linterConfig = toLinterConfig(config);
    log('Linting with config:', JSON.stringify(linterConfig));
    const warnings = await lint(content, linterConfig);
    const lintTime = performance.now() - startTime;
    log('Warnings received:', warnings.length, 'fixable:', warnings.filter(w => w.fix).length);

    state.warnings = warnings;
    state.lintTime = lintTime;

    // Update UI
    state.panel.updateWarnings(warnings, lintTime);
    updateButton(state.button, warnings.length, lintTime);

    // Fix callback for gutter tooltip
    const handleFix = (warning: LintWarning) => {
      if (!warning.fix) return;
      const { start, end } = warning.fix.range;
      const { replacement } = warning.fix;
      textarea.value = textarea.value.slice(0, start) + replacement + textarea.value.slice(end);
      textarea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    };

    gutterMarkers.render(state.gutter, textarea, warnings, handleFix);

    log(`Lint complete: ${warnings.length} warning(s) in ${lintTime.toFixed(1)}ms`);
  } catch (error) {
    logError('Lint failed:', error);
    // Mark service worker as unhealthy to trigger recovery check on next lint
    serviceWorkerHealthy = false;
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
      textarea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    }
  } catch (error) {
    logError('Format failed:', error);
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

  // Scroll into view using computed line height
  const lineHeight = getLineHeight(textarea);
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
    textarea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));

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
 * Detect current site
 */
function getCurrentSite(): 'github' | 'gitlab' | 'reddit' | 'unknown' {
  const hostname = window.location.hostname;
  if (hostname === 'github.com') return 'github';
  if (hostname === 'gitlab.com' || hostname.endsWith('.gitlab.io')) return 'gitlab';
  if (hostname.endsWith('reddit.com')) return 'reddit';
  return 'unknown';
}

/**
 * Get toolbar selectors for current site
 */
function getToolbarSelectors(): string {
  const site = getCurrentSite();
  switch (site) {
    case 'github':
      return '[role="toolbar"], .toolbar-commenting, .tabnav-tabs, .form-actions';
    case 'gitlab':
      return '.md-header, .js-md-preview-button, .md-header-toolbar, .note-actions, .comment-toolbar';
    case 'reddit':
      return '.MarkdownEditor-toolbar, .c-form-actions, .submission-actions';
    default:
      // Try all selectors
      return '[role="toolbar"], .toolbar-commenting, .tabnav-tabs, .form-actions, .md-header, .js-md-preview-button, .md-header-toolbar';
  }
}

/**
 * Create a floating badge for textareas in shadow DOM
 */
function createFloatingBadge(textarea: HTMLTextAreaElement): HTMLElement | null {
  const badge = document.createElement('div');
  badge.className = 'rumdl-floating-badge';
  badge.setAttribute('aria-label', 'rumdl lint status');

  // Use inline styles for shadow DOM compatibility
  badge.style.cssText = `
    position: absolute;
    bottom: 8px;
    right: 8px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    border-radius: 10px;
    font-size: 10px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    z-index: 10;
    cursor: pointer;
    transition: opacity 0.2s;
    pointer-events: auto;
    opacity: 0.7;
  `;

  badge.innerHTML = `
    <span style="font-weight: 600;">rumdl</span>
    <span class="rumdl-badge-count" style="
      background: #2ea043;
      color: white;
      padding: 0 6px;
      border-radius: 10px;
      font-weight: 600;
    ">0</span>
  `;

  badge.title = 'rumdl: No issues';

  // Insert into the textarea's parent (inside shadow DOM)
  const parent = textarea.parentElement;
  if (parent) {
    const parentPosition = getComputedStyle(parent).position;
    if (parentPosition === 'static') {
      parent.style.position = 'relative';
    }
    parent.appendChild(badge);
  }

  badge.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
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

  badge.addEventListener('mouseenter', () => {
    badge.style.opacity = '1';
  });

  badge.addEventListener('mouseleave', () => {
    badge.style.opacity = '0.7';
  });

  return badge;
}

/**
 * Create a lint status button near the textarea
 */
function createLintButton(textarea: HTMLTextAreaElement): HTMLElement | null {
  // Find toolbar by traversing up the DOM - sites use various container structures
  let container: HTMLElement | null = textarea.parentElement;
  let toolbar: Element | null = null;
  const toolbarSelectors = getToolbarSelectors();

  // Look up to 10 levels for a container with a toolbar
  for (let i = 0; i < 10 && container && !toolbar; i++) {
    toolbar = container.querySelector(toolbarSelectors);
    if (!toolbar) {
      container = container.parentElement;
    }
  }

  if (!toolbar) return null;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'rumdl-status-btn';
  button.setAttribute('aria-label', 'rumdl lint status');
  button.innerHTML = `
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M8 0a8 8 0 110 16A8 8 0 018 0zm0 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8 7a1 1 0 011 1v3a1 1 0 01-2 0V8a1 1 0 011-1zm0-3.5a1 1 0 110 2 1 1 0 010-2z"/>
    </svg>
    <span class="rumdl-status-count" aria-live="polite">0</span>
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
 * Update the lint status button or floating badge
 */
function updateButton(button: HTMLElement | null, count: number, lintTime: number): void {
  if (!button) return;

  // Handle floating badge (shadow DOM)
  const badgeCount = button.querySelector('.rumdl-badge-count') as HTMLElement;
  if (badgeCount) {
    badgeCount.textContent = count.toString();
    badgeCount.style.background = count === 0 ? '#2ea043' : (count > 0 ? '#9a6700' : '#2ea043');
  }

  // Handle toolbar button
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

  if (button.classList) {
    button.classList.toggle('has-warnings', count > 0);
  }
}

// Start the extension
init().catch(error => {
  logError('Initialization failed:', error);
});
