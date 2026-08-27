import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  filterRules,
  formatShortcut,
  isRuleEnabled,
  isValidLineLength,
  mergeEditableConfig,
  parseRuleList,
  updateRuleSelection,
  validateConfig,
} from '../popup/config-utils.js';

describe('popup configuration', () => {
  it('rejects malformed imported rule lists', () => {
    const config = validateConfig({
      disabledRules: [1, 'MD001'],
      enabledRules: null,
    });

    expect(config.disabledRules).toEqual(DEFAULT_CONFIG.disabledRules);
    expect(config.enabledRules).toEqual(DEFAULT_CONFIG.enabledRules);
  });

  it('keeps only safe per-rule configuration keys', () => {
    const config = validateConfig({
      ruleConfigs: {
        MD013: { reflow: true },
        constructor: { polluted: true },
        custom: { ignored: true },
      },
    });

    expect(config.ruleConfigs).toEqual({ MD013: { reflow: true } });
  });

  it('preserves per-rule configuration when an editable setting changes', () => {
    const config = mergeEditableConfig({
      ...DEFAULT_CONFIG,
      ruleConfigs: { MD013: { reflow: true } },
    }, {
      showGutterIcons: false,
    });

    expect(config.showGutterIcons).toBe(false);
    expect(config.ruleConfigs).toEqual({ MD013: { reflow: true } });
  });

  it('accepts line lengths only within the advertised 40–500 range', () => {
    expect(isValidLineLength(40)).toBe(true);
    expect(isValidLineLength(500)).toBe(true);
    expect(isValidLineLength(39)).toBe(false);
    expect(isValidLineLength(501)).toBe(false);
    expect(isValidLineLength(80.5)).toBe(false);

    expect(validateConfig({ lineLength: 40 }).lineLength).toBe(40);
    expect(validateConfig({ lineLength: 500 }).lineLength).toBe(500);
    expect(validateConfig({ lineLength: 39 }).lineLength).toBe(DEFAULT_CONFIG.lineLength);
    expect(validateConfig({ lineLength: 501 }).lineLength).toBe(DEFAULT_CONFIG.lineLength);
  });

  it('normalizes comma-separated rule lists without duplicates', () => {
    expect(parseRuleList(' md001, MD013, md001, , MD041 ')).toEqual([
      'MD001',
      'MD013',
      'MD041',
    ]);
  });

  it('treats enabledRules as an allowlist while disabled rules take precedence', () => {
    const config = validateConfig({
      enabledRules: ['MD001', 'MD013'],
      disabledRules: ['MD013'],
    });

    expect(isRuleEnabled(config, 'MD001')).toBe(true);
    expect(isRuleEnabled(config, 'MD013')).toBe(false);
    expect(isRuleEnabled(config, 'MD041')).toBe(false);
  });

  it('updates the active allowlist when a rule checkbox changes', () => {
    const config = validateConfig({
      enabledRules: ['MD001', 'MD013'],
      disabledRules: ['MD041'],
    });

    const disabled = updateRuleSelection(config, 'MD013', false);
    expect(disabled.enabledRules).toEqual(['MD001']);
    expect(isRuleEnabled(disabled, 'MD013')).toBe(false);

    const enabled = updateRuleSelection(disabled, 'MD041', true);
    expect(enabled.enabledRules).toEqual(['MD001', 'MD041']);
    expect(enabled.disabledRules).toEqual([]);
    expect(isRuleEnabled(enabled, 'MD041')).toBe(true);
  });

  it('keeps the final allowlisted rule enabled to avoid switching every rule on', () => {
    const config = validateConfig({ enabledRules: ['MD001'], disabledRules: [] });
    const updated = updateRuleSelection(config, 'MD001', false);

    expect(updated.enabledRules).toEqual(['MD001']);
    expect(isRuleEnabled(updated, 'MD001')).toBe(true);
    expect(isRuleEnabled(updated, 'MD013')).toBe(false);
  });

  it('uses the disabled list when no allowlist is active', () => {
    const config = validateConfig({ enabledRules: [], disabledRules: [] });
    const updated = updateRuleSelection(config, 'MD013', false);

    expect(updated.enabledRules).toEqual([]);
    expect(updated.disabledRules).toEqual(['MD013']);
    expect(isRuleEnabled(updated, 'MD013')).toBe(false);
  });

  it('filters rules by ID or description case-insensitively', () => {
    const rules = [
      { name: 'MD001', description: 'Heading levels increment by one' },
      { name: 'MD013', description: 'Line length' },
    ];

    expect(filterRules(rules, 'md013')).toEqual([rules[1]]);
    expect(filterRules(rules, 'HEADING')).toEqual([rules[0]]);
    expect(filterRules(rules, '')).toEqual(rules);
  });

  it('formats shortcuts for macOS and other platforms', () => {
    expect(formatShortcut(['mod', 'Shift', 'F'], 'macOS')).toBe('⌘⇧F');
    expect(formatShortcut(['mod', 'alt', ']'], 'macOS')).toBe('⌘⌥]');
    expect(formatShortcut(['mod', 'Shift', 'F'], 'Windows')).toBe('Ctrl+Shift+F');
    expect(formatShortcut(['mod', 'alt', ']'], 'Linux')).toBe('Ctrl+Alt+]');
  });
});
