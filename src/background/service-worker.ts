// Service worker for rumdl Chrome extension
// Loads WASM module and handles linting requests from content scripts

import type { MessageType, MessageResponse, LinterConfig, RumdlConfig, LintWarning, RuleInfo } from '../shared/types.js';
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

// Global state
let wasmModule: WasmModule | null = null;
let linter: WasmLinter | null = null;
let lastConfigHash: string = '';
let initPromise: Promise<void> | null = null;

// Import WASM module statically (bundled at build time)
import * as wasmBindings from '../../wasm/rumdl_lib.js';

// Initialize the WASM module
async function initializeWasm(): Promise<void> {
  if (wasmModule) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      console.log('[rumdl] Initializing WASM module...');

      // Fetch the WASM binary
      const wasmPath = chrome.runtime.getURL('wasm/rumdl_lib_bg.wasm');
      const wasmResponse = await fetch(wasmPath);
      const wasmBuffer = await wasmResponse.arrayBuffer();

      // Initialize with the WASM binary
      await wasmBindings.default(wasmBuffer);

      wasmModule = wasmBindings as unknown as WasmModule;

      console.log('[rumdl] WASM module initialized, version:', wasmModule.get_version());
    } catch (error) {
      console.error('[rumdl] Failed to initialize WASM:', error);
      initPromise = null;
      throw error;
    }
  })();

  return initPromise;
}

// Create or update the linter instance based on config
function getLinter(config: LinterConfig): WasmLinter {
  const configHash = JSON.stringify(config);

  if (!linter || configHash !== lastConfigHash) {
    if (linter) {
      try {
        linter.free();
      } catch {
        // Ignore free errors
      }
    }
    linter = new wasmModule!.Linter(config);
    lastConfigHash = configHash;
  }

  return linter;
}

// Convert user config to linter config
function toLinterConfig(config: RumdlConfig): LinterConfig {
  const linterConfig: LinterConfig = {
    disable: config.disabledRules,
    enable: config.enabledRules.length > 0 ? config.enabledRules : undefined,
    'line-length': config.lineLength,
    flavor: config.flavor,
  };

  // Add rule-specific configs
  for (const [ruleName, ruleConfig] of Object.entries(config.ruleConfigs)) {
    linterConfig[ruleName] = ruleConfig;
  }

  return linterConfig;
}

// Handle lint request
async function handleLint(content: string, config: LinterConfig): Promise<LintWarning[]> {
  await initializeWasm();

  if (!wasmModule) {
    throw new Error('WASM module not initialized');
  }

  const linterInstance = getLinter(config);
  const resultJson = linterInstance.check(content);
  return JSON.parse(resultJson);
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
  return JSON.parse(rulesJson);
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

// Initialize WASM on service worker start
initializeWasm().catch(error => {
  console.error('[rumdl] Failed to initialize on startup:', error);
});

console.log('[rumdl] Service worker loaded');
