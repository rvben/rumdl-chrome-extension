// Popup script for rumdl Chrome extension

const DEFAULT_CONFIG = {
  enabled: true,
  flavor: 'standard',
  lineLength: 80,
  disabledRules: ['MD041'],
  enabledRules: [],
  ruleConfigs: {},
  autoFormat: false,
  showGutterIcons: true,
  reflow: false
};

const STORAGE_KEY = 'rumdl_config';

// DOM elements
const elements = {
  version: document.getElementById('version'),
  ruleCount: document.getElementById('ruleCount'),
  enabled: document.getElementById('enabled'),
  flavor: document.getElementById('flavor'),
  lineLength: document.getElementById('lineLength'),
  disabledRules: document.getElementById('disabledRules'),
  enabledRules: document.getElementById('enabledRules'),
  showGutterIcons: document.getElementById('showGutterIcons'),
  autoFormat: document.getElementById('autoFormat'),
  reflow: document.getElementById('reflow'),
  resetBtn: document.getElementById('resetBtn'),
  exportBtn: document.getElementById('exportBtn'),
  importBtn: document.getElementById('importBtn'),
  importFile: document.getElementById('importFile'),
  rulesList: document.getElementById('rulesList'),
  tabs: document.querySelectorAll('.tab'),
  tabContents: document.querySelectorAll('.tab-content')
};

let allRules = [];

const VALID_FLAVORS = ['standard', 'mkdocs', 'mdx', 'quarto', 'obsidian'];

// Escape HTML to prevent XSS
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Load config from storage
async function loadConfig() {
  try {
    const result = await chrome.storage.sync.get(STORAGE_KEY);
    return result[STORAGE_KEY] ? { ...DEFAULT_CONFIG, ...result[STORAGE_KEY] } : DEFAULT_CONFIG;
  } catch (error) {
    console.error('Failed to load config:', error);
    return DEFAULT_CONFIG;
  }
}

// Save config to storage
async function saveConfig(config) {
  try {
    await chrome.storage.sync.set({ [STORAGE_KEY]: config });
    console.log('Config saved:', config);
  } catch (error) {
    console.error('Failed to save config:', error);
  }
}

// Update UI with config values
function updateUI(config) {
  elements.enabled.checked = config.enabled;
  elements.flavor.value = config.flavor;
  elements.lineLength.value = config.lineLength;
  elements.disabledRules.value = config.disabledRules.join(', ');
  elements.enabledRules.value = config.enabledRules.join(', ');
  elements.showGutterIcons.checked = config.showGutterIcons;
  elements.autoFormat.checked = config.autoFormat;
  elements.reflow.checked = config.reflow;

  // Update rules list checkboxes
  updateRulesListUI(config);
}

// Get config from UI
function getConfigFromUI() {
  const parseRuleList = (str) => {
    const trimmed = str.trim();
    return trimmed ? trimmed.split(',').map(r => r.trim().toUpperCase()).filter(r => r) : [];
  };

  return {
    enabled: elements.enabled.checked,
    flavor: elements.flavor.value,
    lineLength: parseInt(elements.lineLength.value, 10) || 80,
    disabledRules: parseRuleList(elements.disabledRules.value),
    enabledRules: parseRuleList(elements.enabledRules.value),
    ruleConfigs: {},
    autoFormat: elements.autoFormat.checked,
    showGutterIcons: elements.showGutterIcons.checked,
    reflow: elements.reflow.checked
  };
}

// Get version from service worker
async function getVersion() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_VERSION' });
    if (response && response.type === 'VERSION_RESULT') {
      return response.version;
    }
  } catch (error) {
    console.error('Failed to get version:', error);
  }
  return null;
}

// Get available rules from service worker
async function getRules() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_RULES' });
    if (response && response.type === 'RULES_RESULT') {
      return response.rules;
    }
  } catch (error) {
    console.error('Failed to get rules:', error);
  }
  return [];
}

// Render rules list
function renderRulesList(rules, config) {
  allRules = rules;

  if (rules.length === 0) {
    elements.rulesList.innerHTML = '<div class="loading">No rules available</div>';
    return;
  }

  const disabledSet = new Set(config.disabledRules.map(r => r.toUpperCase()));

  elements.rulesList.innerHTML = rules.map(rule => {
    const escapedName = escapeHtml(rule.name);
    const escapedDesc = escapeHtml(rule.description);
    return `
    <div class="rule-item">
      <input type="checkbox" id="rule-${escapedName}" data-rule="${escapedName}"
             ${!disabledSet.has(rule.name.toUpperCase()) ? 'checked' : ''}>
      <label for="rule-${escapedName}">
        <span class="rule-name">${escapedName}</span>
        <span class="rule-desc">${escapedDesc}</span>
      </label>
    </div>
  `;
  }).join('');

  // Add change listeners
  elements.rulesList.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', async (e) => {
      const ruleName = e.target.dataset.rule;
      const isEnabled = e.target.checked;

      const config = await loadConfig();
      const disabledSet = new Set(config.disabledRules.map(r => r.toUpperCase()));

      if (isEnabled) {
        disabledSet.delete(ruleName.toUpperCase());
      } else {
        disabledSet.add(ruleName.toUpperCase());
      }

      config.disabledRules = Array.from(disabledSet);
      await saveConfig(config);

      // Update the text input to match
      elements.disabledRules.value = config.disabledRules.join(', ');
    });
  });

  elements.ruleCount.textContent = `${rules.length} rules`;
}

// Update rules list checkboxes based on config
function updateRulesListUI(config) {
  const disabledSet = new Set(config.disabledRules.map(r => r.toUpperCase()));

  elements.rulesList.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
    const ruleName = checkbox.dataset.rule;
    checkbox.checked = !disabledSet.has(ruleName.toUpperCase());
  });
}

// Export config as JSON file
function exportConfig(config) {
  const dataStr = JSON.stringify(config, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'rumdl-config.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Import config from JSON file
async function importConfig(file) {
  try {
    const text = await file.text();
    const config = JSON.parse(text);

    // Validate the config has expected properties
    const validConfig = { ...DEFAULT_CONFIG };
    if (typeof config.enabled === 'boolean') validConfig.enabled = config.enabled;
    if (typeof config.flavor === 'string' && VALID_FLAVORS.includes(config.flavor)) {
      validConfig.flavor = config.flavor;
    }
    if (typeof config.lineLength === 'number') validConfig.lineLength = config.lineLength;
    if (Array.isArray(config.disabledRules)) validConfig.disabledRules = config.disabledRules;
    if (Array.isArray(config.enabledRules)) validConfig.enabledRules = config.enabledRules;
    if (typeof config.autoFormat === 'boolean') validConfig.autoFormat = config.autoFormat;
    if (typeof config.showGutterIcons === 'boolean') validConfig.showGutterIcons = config.showGutterIcons;
    if (typeof config.reflow === 'boolean') validConfig.reflow = config.reflow;
    if (typeof config.ruleConfigs === 'object') validConfig.ruleConfigs = config.ruleConfigs;

    await saveConfig(validConfig);
    updateUI(validConfig);
    updateRulesListUI(validConfig);

    alert('Configuration imported successfully!');
  } catch (error) {
    console.error('Failed to import config:', error);
    alert('Failed to import configuration. Make sure the file is valid JSON.');
  }
}

// Tab switching
function setupTabs() {
  elements.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.dataset.tab;

      // Update active tab
      elements.tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Update active content
      elements.tabContents.forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabId}`);
      });
    });
  });
}

// Initialize popup
async function init() {
  // Set up tabs
  setupTabs();

  // Load and display config
  const config = await loadConfig();
  updateUI(config);

  // Get and display version
  const version = await getVersion();
  if (version) {
    elements.version.textContent = `v${version}`;
  }

  // Load rules list
  const rules = await getRules();
  renderRulesList(rules, config);

  // Add change listeners for auto-save
  const saveOnChange = async () => {
    const newConfig = getConfigFromUI();
    await saveConfig(newConfig);
  };

  elements.enabled.addEventListener('change', saveOnChange);
  elements.flavor.addEventListener('change', saveOnChange);
  elements.lineLength.addEventListener('change', saveOnChange);
  elements.disabledRules.addEventListener('change', async () => {
    await saveOnChange();
    const config = await loadConfig();
    updateRulesListUI(config);
  });
  elements.enabledRules.addEventListener('change', saveOnChange);
  elements.showGutterIcons.addEventListener('change', saveOnChange);
  elements.autoFormat.addEventListener('change', saveOnChange);
  elements.reflow.addEventListener('change', saveOnChange);

  // Reset button
  elements.resetBtn.addEventListener('click', async () => {
    if (confirm('Reset all settings to defaults?')) {
      await saveConfig(DEFAULT_CONFIG);
      updateUI(DEFAULT_CONFIG);
      updateRulesListUI(DEFAULT_CONFIG);
    }
  });

  // Export button
  elements.exportBtn.addEventListener('click', async () => {
    const config = await loadConfig();
    exportConfig(config);
  });

  // Import button
  elements.importBtn.addEventListener('click', () => {
    elements.importFile.click();
  });

  elements.importFile.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      await importConfig(file);
      e.target.value = ''; // Reset file input
    }
  });
}

// Start
init().catch(console.error);
