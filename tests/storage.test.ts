import { describe, it, expect, beforeEach } from 'vitest';
import { validateAndMergeConfig } from '../src/shared/storage';
import { DEFAULT_CONFIG } from '../src/shared/types';
import { resetChromeMocks } from './setup';

describe('validateAndMergeConfig', () => {
  beforeEach(() => {
    resetChromeMocks();
  });

  it('returns default config for null input', () => {
    const result = validateAndMergeConfig(null);
    expect(result).toEqual(DEFAULT_CONFIG);
  });

  it('returns default config for undefined input', () => {
    const result = validateAndMergeConfig(undefined);
    expect(result).toEqual(DEFAULT_CONFIG);
  });

  it('returns default config for array input', () => {
    const result = validateAndMergeConfig([1, 2, 3]);
    expect(result).toEqual(DEFAULT_CONFIG);
  });

  it('returns default config for primitive input', () => {
    expect(validateAndMergeConfig('string')).toEqual(DEFAULT_CONFIG);
    expect(validateAndMergeConfig(123)).toEqual(DEFAULT_CONFIG);
    expect(validateAndMergeConfig(true)).toEqual(DEFAULT_CONFIG);
  });

  it('validates enabled field', () => {
    expect(validateAndMergeConfig({ enabled: true }).enabled).toBe(true);
    expect(validateAndMergeConfig({ enabled: false }).enabled).toBe(false);
    expect(validateAndMergeConfig({ enabled: 'true' }).enabled).toBe(DEFAULT_CONFIG.enabled);
    expect(validateAndMergeConfig({ enabled: 1 }).enabled).toBe(DEFAULT_CONFIG.enabled);
  });

  it('validates flavor field against allowed values', () => {
    expect(validateAndMergeConfig({ flavor: 'standard' }).flavor).toBe('standard');
    expect(validateAndMergeConfig({ flavor: 'mkdocs' }).flavor).toBe('mkdocs');
    expect(validateAndMergeConfig({ flavor: 'mdx' }).flavor).toBe('mdx');
    expect(validateAndMergeConfig({ flavor: 'quarto' }).flavor).toBe('quarto');
    expect(validateAndMergeConfig({ flavor: 'obsidian' }).flavor).toBe('obsidian');
    // Invalid flavors should use default
    expect(validateAndMergeConfig({ flavor: 'invalid' }).flavor).toBe(DEFAULT_CONFIG.flavor);
    expect(validateAndMergeConfig({ flavor: 123 }).flavor).toBe(DEFAULT_CONFIG.flavor);
  });

  it('validates lineLength field', () => {
    expect(validateAndMergeConfig({ lineLength: 100 }).lineLength).toBe(100);
    expect(validateAndMergeConfig({ lineLength: 1 }).lineLength).toBe(1);
    expect(validateAndMergeConfig({ lineLength: 10000 }).lineLength).toBe(10000);
    // Invalid values
    expect(validateAndMergeConfig({ lineLength: 0 }).lineLength).toBe(DEFAULT_CONFIG.lineLength);
    expect(validateAndMergeConfig({ lineLength: -1 }).lineLength).toBe(DEFAULT_CONFIG.lineLength);
    expect(validateAndMergeConfig({ lineLength: 10001 }).lineLength).toBe(DEFAULT_CONFIG.lineLength);
    expect(validateAndMergeConfig({ lineLength: 'string' }).lineLength).toBe(DEFAULT_CONFIG.lineLength);
  });

  it('validates disabledRules field', () => {
    expect(validateAndMergeConfig({ disabledRules: ['MD001', 'MD002'] }).disabledRules).toEqual(['MD001', 'MD002']);
    expect(validateAndMergeConfig({ disabledRules: [] }).disabledRules).toEqual([]);
    // Invalid values
    expect(validateAndMergeConfig({ disabledRules: 'MD001' }).disabledRules).toEqual(DEFAULT_CONFIG.disabledRules);
    expect(validateAndMergeConfig({ disabledRules: [1, 2] }).disabledRules).toEqual(DEFAULT_CONFIG.disabledRules);
  });

  it('validates enabledRules field', () => {
    expect(validateAndMergeConfig({ enabledRules: ['MD001'] }).enabledRules).toEqual(['MD001']);
    expect(validateAndMergeConfig({ enabledRules: [] }).enabledRules).toEqual([]);
    // Invalid values
    expect(validateAndMergeConfig({ enabledRules: { MD001: true } }).enabledRules).toEqual(DEFAULT_CONFIG.enabledRules);
  });

  it('validates boolean display options', () => {
    expect(validateAndMergeConfig({ showGutterIcons: false }).showGutterIcons).toBe(false);
    expect(validateAndMergeConfig({ autoFormat: true }).autoFormat).toBe(true);
    expect(validateAndMergeConfig({ reflow: true }).reflow).toBe(true);
    // Invalid values use defaults
    expect(validateAndMergeConfig({ showGutterIcons: 'yes' }).showGutterIcons).toBe(DEFAULT_CONFIG.showGutterIcons);
  });

  it('validates ruleConfigs with safe keys only', () => {
    const result = validateAndMergeConfig({
      ruleConfigs: {
        MD013: { line_length: 100 },
        MD024: { siblings_only: true },
      },
    });
    expect(result.ruleConfigs).toEqual({
      MD013: { line_length: 100 },
      MD024: { siblings_only: true },
    });
  });

  it('rejects invalid ruleConfig keys (prototype pollution prevention)', () => {
    const result = validateAndMergeConfig({
      ruleConfigs: {
        __proto__: { malicious: true },
        constructor: { evil: true },
        prototype: { bad: true },
        MD001: { valid: true },
        invalidKey: { ignored: true },
      },
    });
    // Only valid MD### keys should be kept
    expect(result.ruleConfigs).toEqual({
      MD001: { valid: true },
    });
    expect(result.ruleConfigs).not.toHaveProperty('__proto__');
    expect(result.ruleConfigs).not.toHaveProperty('constructor');
    expect(result.ruleConfigs).not.toHaveProperty('prototype');
    expect(result.ruleConfigs).not.toHaveProperty('invalidKey');
  });

  it('merges partial config with defaults', () => {
    const result = validateAndMergeConfig({
      enabled: false,
      lineLength: 120,
    });

    expect(result.enabled).toBe(false);
    expect(result.lineLength).toBe(120);
    // Other fields should be defaults
    expect(result.flavor).toBe(DEFAULT_CONFIG.flavor);
    expect(result.disabledRules).toEqual(DEFAULT_CONFIG.disabledRules);
    expect(result.showGutterIcons).toBe(DEFAULT_CONFIG.showGutterIcons);
  });
});
