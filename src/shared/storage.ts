// Chrome storage wrapper for extension configuration

import { RumdlConfig, DEFAULT_CONFIG, VALID_FLAVORS } from './types.js';

const STORAGE_KEY = 'rumdl_config';

/**
 * Safely merge stored config with defaults, validating each field
 * to prevent prototype pollution and invalid values
 */
export function validateAndMergeConfig(stored: unknown): RumdlConfig {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return DEFAULT_CONFIG;
  }

  const obj = stored as Record<string, unknown>;
  const config = { ...DEFAULT_CONFIG };

  // Validate each field explicitly to prevent prototype pollution
  if (typeof obj.enabled === 'boolean') {
    config.enabled = obj.enabled;
  }
  if (typeof obj.flavor === 'string' && VALID_FLAVORS.includes(obj.flavor as typeof VALID_FLAVORS[number])) {
    config.flavor = obj.flavor as typeof VALID_FLAVORS[number];
  }
  if (typeof obj.lineLength === 'number' && obj.lineLength > 0 && obj.lineLength <= 10000) {
    config.lineLength = obj.lineLength;
  }
  if (Array.isArray(obj.disabledRules) && obj.disabledRules.every(r => typeof r === 'string')) {
    config.disabledRules = obj.disabledRules;
  }
  if (Array.isArray(obj.enabledRules) && obj.enabledRules.every(r => typeof r === 'string')) {
    config.enabledRules = obj.enabledRules;
  }
  if (typeof obj.showInlineMarkers === 'boolean') {
    config.showInlineMarkers = obj.showInlineMarkers;
  }
  if (typeof obj.showGutterIcons === 'boolean') {
    config.showGutterIcons = obj.showGutterIcons;
  }
  if (typeof obj.autoFormat === 'boolean') {
    config.autoFormat = obj.autoFormat;
  }
  if (obj.ruleConfigs && typeof obj.ruleConfigs === 'object' && !Array.isArray(obj.ruleConfigs)) {
    // Only copy known safe keys (no __proto__, constructor, etc.)
    const safeRuleConfigs: Record<string, unknown> = {};
    for (const key of Object.keys(obj.ruleConfigs as object)) {
      if (key.startsWith('MD') && /^MD\d{3}$/.test(key)) {
        safeRuleConfigs[key] = (obj.ruleConfigs as Record<string, unknown>)[key];
      }
    }
    config.ruleConfigs = safeRuleConfigs;
  }

  return config;
}

export async function loadConfig(): Promise<RumdlConfig> {
  try {
    const result = await chrome.storage.sync.get(STORAGE_KEY);
    if (result[STORAGE_KEY]) {
      return validateAndMergeConfig(result[STORAGE_KEY]);
    }
    return DEFAULT_CONFIG;
  } catch (error) {
    console.error('[rumdl] Failed to load config:', error);
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(config: Partial<RumdlConfig>): Promise<RumdlConfig> {
  try {
    const currentConfig = await loadConfig();
    const newConfig = { ...currentConfig, ...config };
    await chrome.storage.sync.set({ [STORAGE_KEY]: newConfig });
    return newConfig;
  } catch (error) {
    console.error('[rumdl] Failed to save config:', error);
    throw error;
  }
}

export async function resetConfig(): Promise<RumdlConfig> {
  try {
    await chrome.storage.sync.set({ [STORAGE_KEY]: DEFAULT_CONFIG });
    return DEFAULT_CONFIG;
  } catch (error) {
    console.error('[rumdl] Failed to reset config:', error);
    throw error;
  }
}
