// Shared configuration utilities

import type { RumdlConfig, LinterConfig } from './types.js';

/**
 * Convert user-facing RumdlConfig to internal LinterConfig format
 */
export function toLinterConfig(config: RumdlConfig): LinterConfig {
  const linterConfig: LinterConfig = {
    disable: config.disabledRules,
    'line-length': config.lineLength,
    flavor: config.flavor,
  };

  if (config.enabledRules.length > 0) {
    linterConfig.enable = config.enabledRules;
  }

  // Add rule-specific configs
  for (const [ruleName, ruleConfig] of Object.entries(config.ruleConfigs)) {
    linterConfig[ruleName] = ruleConfig;
  }

  return linterConfig;
}
