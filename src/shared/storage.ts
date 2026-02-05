// Chrome storage wrapper for extension configuration

import { RumdlConfig, DEFAULT_CONFIG } from './types.js';

const STORAGE_KEY = 'rumdl_config';

export async function loadConfig(): Promise<RumdlConfig> {
  try {
    const result = await chrome.storage.sync.get(STORAGE_KEY);
    if (result[STORAGE_KEY]) {
      return { ...DEFAULT_CONFIG, ...result[STORAGE_KEY] };
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
