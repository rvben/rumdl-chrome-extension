// Service worker for rumdl Chrome extension
// Loads WASM module and handles linting requests from content scripts

import type { MessageType, MessageResponse, LinterConfig, RumdlConfig, LintWarning, RuleInfo, ServiceWorkerStatus } from '../shared/types.js';
import { loadConfig, saveConfig } from '../shared/storage.js';

// WASM module types
interface WasmLinter {
  check(content: string): string;
  fix(content: string): string;
  get_config(): string;
  free(): void;
}

interface WasmModule {
  Linter: new (config: LinterConfig) => WasmLinter;
  get_version(): string;
  get_available_rules(): string;
}

// Type guard for WASM module validation
function isValidWasmModule(obj: unknown): obj is WasmModule {
  if (!obj || typeof obj !== 'object') return false;
  const mod = obj as Record<string, unknown>;
  return (
    typeof mod.Linter === 'function' &&
    typeof mod.get_version === 'function' &&
    typeof mod.get_available_rules === 'function'
  );
}

// Global state - note: service workers can be terminated at any time
// State will be re-initialized on next activation
let wasmModule: WasmModule | null = null;
let linter: WasmLinter | null = null;
let lastConfigHash: string = '';
let initPromise: Promise<void> | null = null;
let initFailed: boolean = false;
let initError: string | null = null;
let wasmVersion: string | null = null;

// Import WASM module - use initSync to avoid dynamic import issues in service workers
import { initSync, Linter, get_version, get_available_rules } from '../../wasm/rumdl_lib.js';

// Initialize the WASM module with proper error handling
async function initializeWasm(): Promise<void> {
  // Already initialized
  if (wasmModule) return;

  // Previous init failed permanently
  if (initFailed) {
    throw new Error('WASM initialization previously failed');
  }

  // Init in progress - wait for it
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // Fetch the WASM binary
      const wasmPath = chrome.runtime.getURL('wasm/rumdl_lib_bg.wasm');
      const wasmResponse = await fetch(wasmPath);

      if (!wasmResponse.ok) {
        throw new Error(`Failed to fetch WASM: ${wasmResponse.status}`);
      }

      const wasmBuffer = await wasmResponse.arrayBuffer();

      // Use initSync to avoid dynamic import issues in service workers
      initSync({ module: wasmBuffer });

      // Create module wrapper with the imported functions
      const moduleWrapper = {
        Linter,
        get_version,
        get_available_rules,
      };

      // Validate the module has expected shape
      if (!isValidWasmModule(moduleWrapper)) {
        throw new Error('WASM module does not have expected interface');
      }

      wasmModule = moduleWrapper;
      wasmVersion = moduleWrapper.get_version();
      console.log('[rumdl] WASM initialized, version:', wasmVersion);
    } catch (error) {
      // Mark as permanently failed and store error message
      initFailed = true;
      initError = error instanceof Error ? error.message : 'Unknown WASM initialization error';
      initPromise = null;
      console.error('[rumdl] WASM initialization failed:', initError);
      throw error;
    }
  })();

  return initPromise;
}

// Create or update the linter instance based on config
function getLinter(config: LinterConfig): WasmLinter {
  if (!wasmModule) {
    throw new Error('WASM module not initialized');
  }

  const configHash = JSON.stringify(config);

  if (!linter || configHash !== lastConfigHash) {
    if (linter) {
      try {
        linter.free();
      } catch {
        // Ignore free errors - WASM memory may already be cleaned up
      }
    }
    linter = new wasmModule.Linter(config);
    lastConfigHash = configHash;
  }

  return linter;
}

// Safely parse JSON with error handling
function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    console.error('[rumdl] JSON parse error:', error);
    return fallback;
  }
}

// Handle lint request
async function handleLint(content: string, config: LinterConfig): Promise<LintWarning[]> {
  await initializeWasm();

  if (!wasmModule) {
    throw new Error('WASM module not initialized');
  }

  const linterInstance = getLinter(config);
  const resultJson = linterInstance.check(content);
  return safeJsonParse<LintWarning[]>(resultJson, []);
}

// Handle fix request
async function handleFix(content: string, config: LinterConfig): Promise<string> {
  await initializeWasm();

  if (!wasmModule) {
    throw new Error('WASM module not initialized');
  }

  const linterInstance = getLinter(config);
  return linterInstance.fix(content);
}

// Handle get version request
async function handleGetVersion(): Promise<string> {
  await initializeWasm();

  if (!wasmModule) {
    throw new Error('WASM module not initialized');
  }

  return wasmModule.get_version();
}

// Handle get rules request
async function handleGetRules(): Promise<RuleInfo[]> {
  await initializeWasm();

  if (!wasmModule) {
    throw new Error('WASM module not initialized');
  }

  const rulesJson = wasmModule.get_available_rules();
  return safeJsonParse<RuleInfo[]>(rulesJson, []);
}

// Handle get status request - returns WASM health status
function handleGetStatus(): ServiceWorkerStatus {
  return {
    wasmInitialized: wasmModule !== null,
    wasmError: initError,
    version: wasmVersion,
  };
}

// Message handler
chrome.runtime.onMessage.addListener(
  (message: MessageType, _sender, sendResponse: (response: MessageResponse) => void) => {
    (async () => {
      try {
        switch (message.type) {
          case 'LINT': {
            const warnings = await handleLint(message.content, message.config);
            sendResponse({ type: 'LINT_RESULT', warnings });
            break;
          }

          case 'FIX': {
            const content = await handleFix(message.content, message.config);
            sendResponse({ type: 'FIX_RESULT', content });
            break;
          }

          case 'GET_CONFIG': {
            const config = await loadConfig();
            sendResponse({ type: 'CONFIG_RESULT', config });
            break;
          }

          case 'SET_CONFIG': {
            const config = await saveConfig(message.config);
            // Invalidate linter cache when config changes
            lastConfigHash = '';
            sendResponse({ type: 'CONFIG_RESULT', config });
            break;
          }

          case 'GET_VERSION': {
            const version = await handleGetVersion();
            sendResponse({ type: 'VERSION_RESULT', version });
            break;
          }

          case 'GET_RULES': {
            const rules = await handleGetRules();
            sendResponse({ type: 'RULES_RESULT', rules });
            break;
          }

          case 'GET_STATUS': {
            const status = handleGetStatus();
            sendResponse({ type: 'STATUS_RESULT', status });
            break;
          }

          case 'PING': {
            sendResponse({ type: 'PONG' });
            break;
          }

          default:
            sendResponse({ type: 'ERROR', message: 'Unknown message type' });
        }
      } catch (error) {
        console.error('[rumdl] Error handling message:', error);
        sendResponse({
          type: 'ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    })();

    // Return true to indicate we will send a response asynchronously
    return true;
  }
);

// Initialize WASM on service worker start (best effort)
initializeWasm().catch(error => {
  console.error('[rumdl] Failed to initialize on startup:', error);
});
