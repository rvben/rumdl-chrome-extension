import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockChrome, resetChromeMocks } from './setup';
import {
  sendMessage,
  lint,
  fix,
  getConfig,
  setConfig,
  getVersion,
  getRules,
  ping,
  getStatus,
} from '../src/shared/messages';
import type { LintWarning, RumdlConfig, ServiceWorkerStatus } from '../src/shared/types';

describe('messages', () => {
  beforeEach(() => {
    resetChromeMocks();
  });

  describe('sendMessage', () => {
    it('resolves with response on success', async () => {
      const mockResponse = { type: 'PONG' as const };
      mockChrome.runtime.sendMessage.mockImplementation(
        (_msg: unknown, callback: (response: unknown) => void) => {
          callback(mockResponse);
        }
      );

      const result = await sendMessage({ type: 'PING' });
      expect(result).toEqual(mockResponse);
    });

    it('rejects on chrome.runtime.lastError', async () => {
      mockChrome.runtime.sendMessage.mockImplementation(
        (_msg: unknown, callback: (response: unknown) => void) => {
          (chrome.runtime as { lastError?: { message: string } }).lastError = {
            message: 'Extension context invalidated',
          };
          callback(undefined);
          delete (chrome.runtime as { lastError?: { message: string } }).lastError;
        }
      );

      await expect(sendMessage({ type: 'PING' })).rejects.toThrow(
        'Extension context invalidated'
      );
    });
  });

  describe('lint', () => {
    it('returns warnings on LINT_RESULT', async () => {
      const mockWarnings: LintWarning[] = [
        {
          rule_name: 'MD001',
          message: 'Heading levels should increment by one',
          line: 1,
          column: 1,
          end_line: 1,
          end_column: 10,
          severity: 'warning',
        },
      ];

      mockChrome.runtime.sendMessage.mockImplementation(
        (_msg: unknown, callback: (response: unknown) => void) => {
          callback({ type: 'LINT_RESULT', warnings: mockWarnings, lintTimeMs: 42.5 });
        }
      );

      const result = await lint('# Test', { flavor: 'standard' });
      expect(result).toEqual({ warnings: mockWarnings, lintTimeMs: 42.5 });
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        { type: 'LINT', content: '# Test', config: { flavor: 'standard' } },
        expect.any(Function)
      );
    });

    it('throws on ERROR response', async () => {
      mockChrome.runtime.sendMessage.mockImplementation(
        (_msg: unknown, callback: (response: unknown) => void) => {
          callback({ type: 'ERROR', message: 'WASM not initialized' });
        }
      );

      await expect(lint('# Test', {})).rejects.toThrow('WASM not initialized');
    });

    it('throws on unexpected response type', async () => {
      mockChrome.runtime.sendMessage.mockImplementation(
        (_msg: unknown, callback: (response: unknown) => void) => {
          callback({ type: 'PONG' });
        }
      );

      await expect(lint('# Test', {})).rejects.toThrow('Unexpected response type');
    });
  });

  describe('fix', () => {
    it('returns fixed content on FIX_RESULT', async () => {
      mockChrome.runtime.sendMessage.mockImplementation(
        (_msg: unknown, callback: (response: unknown) => void) => {
          callback({ type: 'FIX_RESULT', content: '# Fixed Test' });
        }
      );

      const result = await fix('# Test', { flavor: 'standard' });
      expect(result).toBe('# Fixed Test');
    });

    it('throws on ERROR response', async () => {
      mockChrome.runtime.sendMessage.mockImplementation(
        (_msg: unknown, callback: (response: unknown) => void) => {
          callback({ type: 'ERROR', message: 'Fix failed' });
        }
      );

      await expect(fix('# Test', {})).rejects.toThrow('Fix failed');
    });
  });

  describe('getConfig', () => {
    it('returns config on CONFIG_RESULT', async () => {
      const mockConfig: RumdlConfig = {
        enabled: true,
        flavor: 'standard',
        lineLength: 80,
        disabledRules: ['MD041'],
        enabledRules: [],
        ruleConfigs: {},
        autoFormat: false,
        showGutterIcons: true,
        reflow: false,
      };

      mockChrome.runtime.sendMessage.mockImplementation(
        (_msg: unknown, callback: (response: unknown) => void) => {
          callback({ type: 'CONFIG_RESULT', config: mockConfig });
        }
      );

      const result = await getConfig();
      expect(result).toEqual(mockConfig);
    });
  });

  describe('setConfig', () => {
    it('returns updated config on CONFIG_RESULT', async () => {
      const mockConfig: RumdlConfig = {
        enabled: false,
        flavor: 'mkdocs',
        lineLength: 100,
        disabledRules: [],
        enabledRules: [],
        ruleConfigs: {},
        autoFormat: true,
        showGutterIcons: false,
        reflow: true,
      };

      mockChrome.runtime.sendMessage.mockImplementation(
        (_msg: unknown, callback: (response: unknown) => void) => {
          callback({ type: 'CONFIG_RESULT', config: mockConfig });
        }
      );

      const result = await setConfig({ enabled: false });
      expect(result).toEqual(mockConfig);
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        { type: 'SET_CONFIG', config: { enabled: false } },
        expect.any(Function)
      );
    });
  });

  describe('getVersion', () => {
    it('returns version string on VERSION_RESULT', async () => {
      mockChrome.runtime.sendMessage.mockImplementation(
        (_msg: unknown, callback: (response: unknown) => void) => {
          callback({ type: 'VERSION_RESULT', version: '1.0.0' });
        }
      );

      const result = await getVersion();
      expect(result).toBe('1.0.0');
    });
  });

  describe('getRules', () => {
    it('returns rules array on RULES_RESULT', async () => {
      const mockRules = [
        { name: 'MD001', description: 'Heading levels should increment by one' },
        { name: 'MD002', description: 'First heading should be a top-level heading' },
      ];

      mockChrome.runtime.sendMessage.mockImplementation(
        (_msg: unknown, callback: (response: unknown) => void) => {
          callback({ type: 'RULES_RESULT', rules: mockRules });
        }
      );

      const result = await getRules();
      expect(result).toEqual(mockRules);
    });
  });

  describe('ping', () => {
    it('returns true on PONG response', async () => {
      mockChrome.runtime.sendMessage.mockImplementation(
        (_msg: unknown, callback: (response: unknown) => void) => {
          callback({ type: 'PONG' });
        }
      );

      const result = await ping();
      expect(result).toBe(true);
    });

    it('returns false on other response', async () => {
      mockChrome.runtime.sendMessage.mockImplementation(
        (_msg: unknown, callback: (response: unknown) => void) => {
          callback({ type: 'ERROR', message: 'Not ready' });
        }
      );

      const result = await ping();
      expect(result).toBe(false);
    });

    it('returns false on error', async () => {
      mockChrome.runtime.sendMessage.mockImplementation(
        (_msg: unknown, callback: (response: unknown) => void) => {
          (chrome.runtime as { lastError?: { message: string } }).lastError = {
            message: 'Service worker not available',
          };
          callback(undefined);
          delete (chrome.runtime as { lastError?: { message: string } }).lastError;
        }
      );

      const result = await ping();
      expect(result).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('returns status on STATUS_RESULT', async () => {
      const mockStatus: ServiceWorkerStatus = {
        wasmInitialized: true,
        wasmError: null,
        version: '0.1.13',
      };

      mockChrome.runtime.sendMessage.mockImplementation(
        (_msg: unknown, callback: (response: unknown) => void) => {
          callback({ type: 'STATUS_RESULT', status: mockStatus });
        }
      );

      const result = await getStatus();
      expect(result).toEqual(mockStatus);
    });

    it('returns error status when WASM failed', async () => {
      const mockStatus: ServiceWorkerStatus = {
        wasmInitialized: false,
        wasmError: 'Failed to compile WebAssembly module',
        version: null,
      };

      mockChrome.runtime.sendMessage.mockImplementation(
        (_msg: unknown, callback: (response: unknown) => void) => {
          callback({ type: 'STATUS_RESULT', status: mockStatus });
        }
      );

      const result = await getStatus();
      expect(result.wasmInitialized).toBe(false);
      expect(result.wasmError).toBe('Failed to compile WebAssembly module');
    });
  });
});
