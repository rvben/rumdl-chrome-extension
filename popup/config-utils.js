export const DEFAULT_CONFIG = {
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

export const VALID_FLAVORS = ['standard', 'mkdocs', 'mdx', 'quarto', 'obsidian'];
export const MIN_LINE_LENGTH = 40;
export const MAX_LINE_LENGTH = 500;

export function normalizeRuleList(value) {
  if (!Array.isArray(value) || !value.every(rule => typeof rule === 'string')) {
    return null;
  }

  return [...new Set(value
    .map(rule => rule.trim().toUpperCase())
    .filter(Boolean))];
}

export function parseRuleList(value) {
  return normalizeRuleList(String(value).split(',')) ?? [];
}

export function isValidLineLength(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= MIN_LINE_LENGTH && number <= MAX_LINE_LENGTH;
}

export function isRuleEnabled(config, ruleName) {
  const name = ruleName.toUpperCase();
  const disabledRules = new Set(config.disabledRules.map(rule => rule.toUpperCase()));
  const enabledRules = new Set(config.enabledRules.map(rule => rule.toUpperCase()));

  if (disabledRules.has(name)) return false;
  return enabledRules.size === 0 || enabledRules.has(name);
}

export function updateRuleSelection(config, ruleName, enabled) {
  const name = ruleName.toUpperCase();
  const disabledRules = new Set(config.disabledRules.map(rule => rule.toUpperCase()));
  const enabledRules = new Set(config.enabledRules.map(rule => rule.toUpperCase()));

  if (enabledRules.size > 0) {
    if (!enabled && enabledRules.size === 1 && enabledRules.has(name)) {
      return validateConfig(config);
    }
    if (enabled) {
      enabledRules.add(name);
      disabledRules.delete(name);
    } else {
      enabledRules.delete(name);
    }
  } else if (enabled) {
    disabledRules.delete(name);
  } else {
    disabledRules.add(name);
  }

  return validateConfig({
    ...config,
    disabledRules: [...disabledRules],
    enabledRules: [...enabledRules],
  });
}

export function filterRules(rules, query) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return rules;

  return rules.filter(rule =>
    rule.name.toLocaleLowerCase().includes(normalizedQuery)
    || rule.description.toLocaleLowerCase().includes(normalizedQuery)
  );
}

export function formatShortcut(parts, platform = '') {
  const isMac = platform.toLocaleLowerCase().includes('mac');
  return parts.map(part => {
    if (part === 'mod') return isMac ? '⌘' : 'Ctrl';
    if (part === 'alt') return isMac ? '⌥' : 'Alt';
    if (part === 'Shift') return isMac ? '⇧' : 'Shift';
    return part;
  }).join(isMac ? '' : '+');
}

export function validateConfig(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
  const config = {
    ...DEFAULT_CONFIG,
    disabledRules: [...DEFAULT_CONFIG.disabledRules],
    enabledRules: [...DEFAULT_CONFIG.enabledRules],
    ruleConfigs: {},
  };

  if (typeof input.enabled === 'boolean') config.enabled = input.enabled;
  if (typeof input.flavor === 'string' && VALID_FLAVORS.includes(input.flavor)) {
    config.flavor = input.flavor;
  }
  if (isValidLineLength(input.lineLength)) {
    config.lineLength = input.lineLength;
  }

  for (const key of ['disabledRules', 'enabledRules']) {
    const rules = normalizeRuleList(input[key]);
    if (rules) config[key] = rules;
  }

  for (const key of ['autoFormat', 'showGutterIcons', 'reflow']) {
    if (typeof input[key] === 'boolean') config[key] = input[key];
  }

  if (input.ruleConfigs && typeof input.ruleConfigs === 'object' && !Array.isArray(input.ruleConfigs)) {
    for (const [ruleName, ruleConfig] of Object.entries(input.ruleConfigs)) {
      if (/^MD\d{3}$/.test(ruleName)) {
        config.ruleConfigs[ruleName] = ruleConfig;
      }
    }
  }

  return config;
}

export function mergeEditableConfig(currentConfig, editableConfig) {
  const current = validateConfig(currentConfig);
  return validateConfig({
    ...current,
    ...editableConfig,
    ruleConfigs: current.ruleConfigs,
  });
}
