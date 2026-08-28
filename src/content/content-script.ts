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
import { getCurrentSite } from '../shared/site-utils.js';
import { setTextareaValue, setTextareaValueIfUnchanged } from './textarea-utils.js';
import type {
  LintWarning,
  PageStatusRequest,
  PageStatusResponse,
  RumdlConfig,
} from '../shared/types.js';

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
  gutter: HTMLElement | null;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  lastContent: string | null;
  warnings: LintWarning[];
  button: HTMLElement | null;
  currentWarningIndex: number;
  lintTime: number;
  isPanelVisible: boolean;
  inputHandler: () => void;
  pasteHandler: (event: ClipboardEvent) => void;
}

const editorStates = new Map<HTMLTextAreaElement, EditorState>();
let lintingActive = false;

// Debounce delay for linting (ms)
const LINT_DEBOUNCE_MS = 150;

// Track service worker health for recovery
let serviceWorkerHealthy = false;
let lastServiceWorkerCheck = 0;
const SERVICE_WORKER_CHECK_INTERVAL = 30000; // 30 seconds

// Keep-alive: ping the service worker every 20s to prevent Chrome from
// terminating it while editors are active (MV3 kills idle workers after ~30s)
let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

chrome.runtime.onMessage.addListener((message: PageStatusRequest, _sender, sendResponse) => {
  if (message?.type !== 'GET_PAGE_STATUS') return;

  const response: PageStatusResponse = {
    type: 'PAGE_STATUS_RESULT',
    status: {
      editorCount: editorStates.size,
      enabled: Boolean(config?.enabled && lintingActive),
      serviceWorkerHealthy,
      site: getCurrentSite(),
    },
  };
  sendResponse(response);
});

/**
 * Start keep-alive pings if editors are active
 */
function startKeepAlive(): void {
  if (keepAliveTimer) return;
  keepAliveTimer = setInterval(() => {
    if (editorStates.size > 0) {
      ping().catch(() => {
        serviceWorkerHealthy = false;
      });
    } else {
      stopKeepAlive();
    }
  }, 20000);
}

/**
 * Stop keep-alive pings
 */
function stopKeepAlive(): void {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

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
  log('Content script starting on', window.location.hostname);

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
  log('Service worker ready');

  // Wait for WASM to initialize (async fetch of ~4MB binary)
  let status = await getStatus();
  for (let i = 0; i < 25 && !status.wasmInitialized && !status.wasmError; i++) {
    await new Promise(r => setTimeout(r, 200));
    status = await getStatus();
  }
  if (!status.wasmInitialized) {
    logError('WASM not initialized:', status.wasmError);
    showErrorNotification(
      'Linting unavailable',
      status.wasmError || 'WASM module failed to initialize'
    );
    return;
  }
  log('WASM initialized, version:', status.version);
  serviceWorkerHealthy = true;

  // Load configuration
  try {
    config = await getConfig();
    log('Config loaded, enabled:', config.enabled);
  } catch (error) {
    logError('Failed to load config:', error);
    showErrorNotification('Failed to load configuration', String(error));
    return;
  }

  // Listen for config changes (store reference for cleanup)
  storageListener = (changes, area) => {
    if (area === 'sync' && changes.rumdl_config) {
      const wasEnabled = config?.enabled ?? false;
      config = validateAndMergeConfig(changes.rumdl_config.newValue);
      log('Config updated from storage');

      if (!config.enabled) {
        stopLinting();
        return;
      }

      if (!wasEnabled || !lintingActive) {
        startLinting();
        return;
      }

      // Update config on all panels and force re-lint all editors
      const linterConfig = toLinterConfig(config);
      for (const [textarea, state] of editorStates.entries()) {
        state.panel.updateConfig(linterConfig);
        syncGutterVisibility(textarea, state);
        // Clear cached content to force re-lint with the new config
        state.lastContent = null;
        performLint(textarea);
      }
    }
  };
  chrome.storage.onChanged.addListener(storageListener);

  if (config.enabled) {
    startLinting();
  } else {
    log('Extension is disabled');
  }

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

  stopLinting();

  // Remove storage listener
  if (storageListener) {
    chrome.storage.onChanged.removeListener(storageListener);
    storageListener = null;
  }
}

/**
 * Activate editor discovery and navigation listeners.
 */
function startLinting(): void {
  if (lintingActive || !config?.enabled) return;

  lintingActive = true;
  editorManager.observe((textarea, event) => {
    if (event === 'added') {
      setupEditor(textarea);
    } else {
      cleanupEditor(textarea);
    }
  });

  document.addEventListener('turbo:load', handleNavigation);
  document.addEventListener('pjax:end', handleNavigation);
  document.addEventListener('turbolinks:load', handleNavigation);
  window.addEventListener('popstate', handleNavigation);
}

/**
 * Remove all lint UI and listeners while retaining the configuration listener,
 * so the extension can be enabled again without reloading the page.
 */
function stopLinting(): void {
  lintingActive = false;

  document.removeEventListener('turbo:load', handleNavigation);
  document.removeEventListener('pjax:end', handleNavigation);
  document.removeEventListener('turbolinks:load', handleNavigation);
  window.removeEventListener('popstate', handleNavigation);

  editorManager.disconnect();

  // Defensive cleanup in case an editor was detached without an observer event.
  for (const textarea of Array.from(editorStates.keys())) {
    cleanupEditor(textarea);
  }

  keyboardShortcuts.unregisterAll();
  destroyTooltip();
  stopKeepAlive();
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
  if (editorStates.has(textarea) || !config?.enabled) return;

  log('Setting up editor:', textarea.placeholder || textarea.name || textarea.id || 'unnamed');

  // Create warning panel
  const panel = new WarningPanel();

  // Create gutter for inline markers when enabled
  const gutter = config.showGutterIcons
    ? gutterMarkers.createGutter(textarea)
    : null;

  // Create status button in toolbar
  const button = createLintButton(textarea);

  const inputHandler = () => scheduleLint(textarea);
  const pasteHandler = (event: ClipboardEvent) => handlePaste(event, textarea);

  // Store state
  const state: EditorState = {
    panel,
    gutter,
    debounceTimer: null,
    lastContent: null,
    warnings: [],
    button,
    currentWarningIndex: -1,
    lintTime: 0,
    isPanelVisible: false,
    inputHandler,
    pasteHandler,
  };
  editorStates.set(textarea, state);

  panel.setOnVisibilityChange((visible) => {
    state.isPanelVisible = visible;
    state.button?.setAttribute('aria-expanded', String(visible));
  });

  // When a fix is applied from the panel, re-lint immediately (bypass debounce)
  panel.setOnFixApplied(() => {
    // Clear any pending debounced lint
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
      state.debounceTimer = null;
    }
    // Clear cached content to force re-lint
    state.lastContent = null;
    performLint(textarea);
  });

  // Add input listener with debounce
  textarea.addEventListener('input', inputHandler);

  // Add paste handler for format on paste
  textarea.addEventListener('paste', pasteHandler);

  // Register keyboard shortcuts
  keyboardShortcuts.register(textarea, (action, ta) => handleShortcut(action, ta));

  // Keep service worker alive while editors are active
  startKeepAlive();

  // Initial lint
  performLint(textarea);
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

  textarea.removeEventListener('input', state.inputHandler);
  textarea.removeEventListener('paste', state.pasteHandler);

  // Clean up tooltips
  destroyTooltip();

  editorStates.delete(textarea);
}

function syncGutterVisibility(textarea: HTMLTextAreaElement, state: EditorState): void {
  if (config?.showGutterIcons) {
    if (!state.gutter) {
      state.gutter = gutterMarkers.createGutter(textarea);
    }
    return;
  }

  if (state.gutter) {
    gutterMarkers.removeGutter(textarea);
    state.gutter = null;
  }
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
  if (!state || !config?.enabled) return;

  const content = textarea.value;
  const requestConfig = config;

  // Skip if content hasn't changed
  if (content === state.lastContent) return;
  state.lastContent = content;
  state.panel.setLinting();
  updateButton(state.button, state.warnings.length, state.lintTime, 'linting');

  // Skip empty content
  if (!content.trim()) {
    state.warnings = [];
    state.lintTime = 0;
    state.panel.updateWarnings([], 0, content);
    updateButton(state.button, 0, 0);
    if (state.gutter) gutterMarkers.clear(state.gutter);
    return;
  }

  try {
    // Check service worker health before linting
    const healthy = await checkServiceWorkerHealth();
    if (!healthy) {
      log('Service worker not healthy, skipping lint');
      state.panel.setError('Linting is unavailable. Type to retry or reload the page.');
      updateButton(state.button, state.warnings.length, state.lintTime, 'error');
      return;
    }

    if (
      editorStates.get(textarea) !== state ||
      textarea.value !== content ||
      config !== requestConfig ||
      !requestConfig.enabled
    ) {
      return;
    }

    const linterConfig = toLinterConfig(requestConfig);
    log('Linting with config:', JSON.stringify(linterConfig));
    const result = await lint(content, linterConfig);
    const { warnings, lintTimeMs } = result;

    if (
      editorStates.get(textarea) !== state ||
      textarea.value !== content ||
      config !== requestConfig ||
      !requestConfig.enabled
    ) {
      return;
    }

    log('Warnings received:', warnings.length, 'fixable:', warnings.filter(w => w.fix).length);

    state.warnings = warnings;
    state.lintTime = lintTimeMs;
    state.currentWarningIndex = -1;

    // Update UI
    state.panel.updateWarnings(warnings, lintTimeMs, content);
    updateButton(state.button, warnings.length, lintTimeMs);

    // Fix callback for gutter tooltip
    const handleFix = (warning: LintWarning) => {
      if (!warning.fix) return;
      const { start, end } = warning.fix.range;
      const { replacement } = warning.fix;
      if (!setTextareaValueIfUnchanged(
        textarea,
        content,
        content.slice(0, start) + replacement + content.slice(end)
      )) {
        state.lastContent = null;
        performLint(textarea);
        return;
      }
      // Re-lint immediately (bypass debounce)
      if (state.debounceTimer) {
        clearTimeout(state.debounceTimer);
        state.debounceTimer = null;
      }
      state.lastContent = null;
      performLint(textarea);
    };

    if (state.gutter) {
      gutterMarkers.render(state.gutter, textarea, warnings, handleFix);
    }

    log(`Lint complete: ${warnings.length} warning(s) in ${lintTimeMs.toFixed(1)}ms`);
  } catch (error) {
    logError('Lint failed:', error);
    serviceWorkerHealthy = false;
    lastServiceWorkerCheck = 0;

    if (!(
      editorStates.get(textarea) === state
      && textarea.value === content
      && config === requestConfig
      && requestConfig.enabled
    )) return;

    state.panel.setError('Linting failed. Type to retry.');
    updateButton(state.button, state.warnings.length, state.lintTime, 'error');
    showErrorNotification('Linting failed', 'Type to retry, or reload the page if the problem continues.');
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
      } else {
        state.panel.show(textarea, toLinterConfig(config), state.button ?? textarea);
        state.panel.updateWarnings(
          state.warnings,
          state.lintTime,
          state.lastContent ?? textarea.value
        );
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
    const originalValue = textarea.value;
    const linterConfig = toLinterConfig(config);
    const fixed = await fix(originalValue, linterConfig);
    if (fixed !== originalValue && textarea.value === originalValue) {
      const cursorPos = textarea.selectionStart;
      if (!setTextareaValueIfUnchanged(textarea, originalValue, fixed)) return;
      // Try to maintain cursor position
      textarea.selectionStart = Math.min(cursorPos, fixed.length);
      textarea.selectionEnd = textarea.selectionStart;
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
  if (!state || state.lastContent !== textarea.value) return;

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
    setTextareaValue(textarea, value.slice(0, start) + replacement + value.slice(end));

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
 * Get toolbar selectors for current site
 */
function getToolbarSelectors(): string {
  const site = getCurrentSite();
  switch (site) {
    case 'github':
      return '[role="toolbar"], .toolbar-commenting, .tabnav-tabs, .form-actions';
    case 'gitlab':
      return '.md-header, .js-md-preview-button, .md-header-toolbar, .note-actions, .comment-toolbar';
    default:
      // Try all selectors
      return '[role="toolbar"], .toolbar-commenting, .tabnav-tabs, .form-actions, .md-header, .js-md-preview-button, .md-header-toolbar';
  }
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
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-label', 'rumdl: No issues. Activate to open lint details.');
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
      } else {
        state.panel.show(textarea, toLinterConfig(config), button);
        state.panel.updateWarnings(
          state.warnings,
          state.lintTime,
          state.lastContent ?? textarea.value
        );
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
function updateButton(
  button: HTMLElement | null,
  count: number,
  lintTime: number,
  status: 'ready' | 'linting' | 'error' = 'ready'
): void {
  if (!button) return;

  const countEl = button.querySelector('.rumdl-status-count');
  if (countEl) {
    countEl.textContent = count.toString();
  }

  const timeEl = button.querySelector('.rumdl-status-time');
  if (timeEl) {
    timeEl.textContent = status === 'linting'
      ? 'Checking…'
      : lintTime > 0
        ? `${lintTime.toFixed(0)}ms`
        : '';
  }

  const resultLabel = count === 0
    ? `rumdl: No issues${lintTime > 0 ? ` (${lintTime.toFixed(0)}ms)` : ''}`
    : `rumdl: ${count} issue${count > 1 ? 's' : ''}${lintTime > 0 ? ` (${lintTime.toFixed(0)}ms)` : ''}`;
  const stateLabel = status === 'linting'
    ? 'rumdl: Checking Markdown'
    : status === 'error'
      ? 'rumdl: Linting failed. Activate to view the last result.'
      : resultLabel;

  button.title = stateLabel;
  button.setAttribute('aria-label', `${stateLabel}. Activate to open lint details.`);
  button.toggleAttribute('aria-busy', status === 'linting');

  if (button.classList) {
    button.classList.toggle('has-warnings', count > 0);
    button.classList.toggle('is-linting', status === 'linting');
    button.classList.toggle('has-error', status === 'error');
  }
}

// Start the extension
init().catch(error => {
  logError('Initialization failed:', error);
});
