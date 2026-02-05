import { describe, it, expect } from 'vitest';
import { toLinterConfig } from '../src/shared/config-utils';
import type { RumdlConfig } from '../src/shared/types';

describe('toLinterConfig', () => {
  it('converts basic config correctly', () => {
    const config: RumdlConfig = {
      enabled: true,
      flavor: 'standard',
      lineLength: 80,
      disabledRules: ['MD041'],
      enabledRules: [],
      ruleConfigs: {},
      autoFormat: false,
      showInlineMarkers: true,
      showGutterIcons: true,
    };

    const result = toLinterConfig(config);

    expect(result.disable).toEqual(['MD041']);
    expect(result['line-length']).toBe(80);
    expect(result.flavor).toBe('standard');
    expect(result.enable).toBeUndefined();
  });

  it('includes enabled rules when present', () => {
    const config: RumdlConfig = {
      enabled: true,
      flavor: 'mkdocs',
      lineLength: 120,
      disabledRules: [],
      enabledRules: ['MD001', 'MD002'],
      ruleConfigs: {},
      autoFormat: false,
      showInlineMarkers: true,
      showGutterIcons: true,
    };

    const result = toLinterConfig(config);

    expect(result.enable).toEqual(['MD001', 'MD002']);
    expect(result.flavor).toBe('mkdocs');
    expect(result['line-length']).toBe(120);
  });

  it('includes rule-specific configs', () => {
    const config: RumdlConfig = {
      enabled: true,
      flavor: 'standard',
      lineLength: 80,
      disabledRules: [],
      enabledRules: [],
      ruleConfigs: {
        MD013: { line_length: 100 },
        MD024: { siblings_only: true },
      },
      autoFormat: false,
      showInlineMarkers: true,
      showGutterIcons: true,
    };

    const result = toLinterConfig(config);

    expect(result.MD013).toEqual({ line_length: 100 });
    expect(result.MD024).toEqual({ siblings_only: true });
  });

  it('handles all flavors', () => {
    const flavors = ['standard', 'mkdocs', 'mdx', 'quarto', 'obsidian'] as const;

    for (const flavor of flavors) {
      const config: RumdlConfig = {
        enabled: true,
        flavor,
        lineLength: 80,
        disabledRules: [],
        enabledRules: [],
        ruleConfigs: {},
        autoFormat: false,
        showInlineMarkers: true,
        showGutterIcons: true,
      };

      const result = toLinterConfig(config);
      expect(result.flavor).toBe(flavor);
    }
  });
});
