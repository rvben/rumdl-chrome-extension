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
} from './config-utils.js';

const STORAGE_KEY = 'rumdl_config';

const elements = {
  mainContent: document.getElementById('mainContent'),
  startupState: document.getElementById('startupState'),
  startupMessage: document.getElementById('startupMessage'),
  retryLoadBtn: document.getElementById('retryLoadBtn'),
  settingsShell: document.getElementById('settingsShell'),
  version: document.getElementById('version'),
  ruleCount: document.getElementById('ruleCount'),
  saveStatus: document.getElementById('saveStatus'),
  retrySaveBtn: document.getElementById('retrySaveBtn'),
  enabled: document.getElementById('enabled'),
  flavor: document.getElementById('flavor'),
  lineLength: document.getElementById('lineLength'),
  lineLengthError: document.getElementById('lineLengthError'),
  disabledRules: document.getElementById('disabledRules'),
  enabledRules: document.getElementById('enabledRules'),
  showGutterIcons: document.getElementById('showGutterIcons'),
  autoFormat: document.getElementById('autoFormat'),
  reflow: document.getElementById('reflow'),
  resetBtn: document.getElementById('resetBtn'),
  exportBtn: document.getElementById('exportBtn'),
  importBtn: document.getElementById('importBtn'),
  importFile: document.getElementById('importFile'),
  ruleSearch: document.getElementById('ruleSearch'),
  rulesMode: document.getElementById('rulesMode'),
  rulesList: document.getElementById('rulesList'),
  rulesResults: document.getElementById('rulesResults'),
  tabs: [...document.querySelectorAll('[role="tab"]')],
  tabContents: [...document.querySelectorAll('[role="tabpanel"]')],
  shortcuts: [...document.querySelectorAll('[data-shortcut]')],
};

let currentConfig = validateConfig(DEFAULT_CONFIG);
let availableRules = [];
let saveQueue = Promise.resolve();
let saveRequestId = 0;
let failedSaveConfig = null;
let listenersReady = false;

async function loadConfig() {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  return validateConfig(result[STORAGE_KEY]);
}

async function writeConfig(config) {
  const validatedConfig = validateConfig(config);
  await chrome.storage.sync.set({ [STORAGE_KEY]: validatedConfig });
  return validatedConfig;
}

function setSaveStatus(message, state = 'idle', retryConfig = null) {
  elements.saveStatus.textContent = message;
  elements.saveStatus.dataset.state = state;
  failedSaveConfig = retryConfig;
  elements.retrySaveBtn.hidden = !retryConfig;
}

async function requestSave(config, successMessage = 'All changes saved') {
  const validatedConfig = validateConfig(config);
  currentConfig = validatedConfig;
  const requestId = ++saveRequestId;
  setSaveStatus('Saving…', 'saving');

  const operation = saveQueue.then(() => writeConfig(validatedConfig));
  saveQueue = operation.catch(() => undefined);

  try {
    const savedConfig = await operation;
    if (requestId === saveRequestId) {
      setSaveStatus(successMessage, 'saved');
    }
    return savedConfig;
  } catch (error) {
    console.error('Failed to save settings:', error);
    if (requestId === saveRequestId) {
      setSaveStatus('Could not save changes.', 'error', validatedConfig);
    }
    return null;
  }
}

function validateLineLengthField() {
  const isValid = isValidLineLength(elements.lineLength.value);
  const message = isValid ? '' : 'Enter a whole number from 40 to 500.';
  elements.lineLength.setCustomValidity(message);
  elements.lineLength.setAttribute('aria-invalid', String(!isValid));
  elements.lineLengthError.textContent = message;
  return isValid;
}

function updateRuleMode(config) {
  const enabledCount = config.enabledRules.length;
  const disabledCount = config.disabledRules.length;

  if (enabledCount > 0) {
    const finalRuleHint = enabledCount === 1 ? ' Select another before turning off the last one.' : '';
    elements.rulesMode.textContent = `${enabledCount} selected ${enabledCount === 1 ? 'rule' : 'rules'} enabled; disabled rules take precedence.${finalRuleHint}`;
  } else if (disabledCount > 0) {
    elements.rulesMode.textContent = `All rules enabled except ${disabledCount} disabled ${disabledCount === 1 ? 'rule' : 'rules'}.`;
  } else {
    elements.rulesMode.textContent = 'All rules enabled.';
  }
}

function updateUI(config) {
  currentConfig = validateConfig(config);
  elements.enabled.checked = currentConfig.enabled;
  elements.flavor.value = currentConfig.flavor;
  elements.lineLength.value = String(currentConfig.lineLength);
  elements.disabledRules.value = currentConfig.disabledRules.join(', ');
  elements.enabledRules.value = currentConfig.enabledRules.join(', ');
  elements.showGutterIcons.checked = currentConfig.showGutterIcons;
  elements.autoFormat.checked = currentConfig.autoFormat;
  elements.reflow.checked = currentConfig.reflow;
  validateLineLengthField();
  updateRuleMode(currentConfig);
  renderRulesList();
}

function getConfigFromUI() {
  return mergeEditableConfig(currentConfig, {
    enabled: elements.enabled.checked,
    flavor: elements.flavor.value,
    lineLength: Number(elements.lineLength.value),
    disabledRules: parseRuleList(elements.disabledRules.value),
    enabledRules: parseRuleList(elements.enabledRules.value),
    autoFormat: elements.autoFormat.checked,
    showGutterIcons: elements.showGutterIcons.checked,
    reflow: elements.reflow.checked,
  });
}

async function getRules() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_RULES' });
  if (!response || response.type !== 'RULES_RESULT' || !Array.isArray(response.rules)) {
    throw new Error('The background service did not return a valid rule list.');
  }
  return response.rules;
}

function createRulesState(message, actionLabel, action) {
  const state = document.createElement('div');
  state.className = 'state-block compact';

  const text = document.createElement('span');
  text.textContent = message;
  state.appendChild(text);

  if (actionLabel && action) {
    const button = document.createElement('button');
    button.className = 'btn btn-secondary btn-small';
    button.type = 'button';
    button.textContent = actionLabel;
    button.addEventListener('click', action);
    state.appendChild(button);
  }

  return state;
}

function renderRulesLoading() {
  const state = createRulesState('Loading rules…');
  const spinner = document.createElement('span');
  spinner.className = 'spinner';
  spinner.setAttribute('aria-hidden', 'true');
  state.prepend(spinner);
  elements.rulesList.replaceChildren(state);
  elements.rulesList.setAttribute('aria-busy', 'true');
  elements.ruleCount.textContent = 'Loading rules';
}

function renderRulesList() {
  if (!availableRules.length) return;

  const filteredRules = filterRules(availableRules, elements.ruleSearch.value);
  elements.rulesList.setAttribute('aria-busy', 'false');
  elements.ruleCount.textContent = `${availableRules.length} ${availableRules.length === 1 ? 'rule' : 'rules'}`;
  elements.rulesResults.textContent = `${filteredRules.length} of ${availableRules.length} rules shown.`;

  if (!filteredRules.length) {
    const query = elements.ruleSearch.value.trim();
    elements.rulesList.replaceChildren(createRulesState(
      `No rules match “${query}”.`,
      'Clear search',
      () => {
        elements.ruleSearch.value = '';
        renderRulesList();
        elements.ruleSearch.focus();
      },
    ));
    return;
  }

  const fragment = document.createDocumentFragment();
  filteredRules.forEach((rule, index) => {
    const item = document.createElement('div');
    item.className = 'rule-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `rule-choice-${index}`;
    checkbox.dataset.rule = rule.name;
    checkbox.checked = isRuleEnabled(currentConfig, rule.name);
    checkbox.disabled = currentConfig.enabledRules.length === 1 && checkbox.checked;
    if (checkbox.disabled) {
      checkbox.title = 'Select another rule before turning off the final enabled rule.';
    }

    const label = document.createElement('label');
    label.htmlFor = checkbox.id;

    const name = document.createElement('span');
    name.className = 'rule-name';
    name.textContent = rule.name;

    const description = document.createElement('span');
    description.className = 'rule-desc';
    description.textContent = rule.description;

    label.append(name, description);
    item.append(checkbox, label);
    fragment.appendChild(item);
  });

  elements.rulesList.replaceChildren(fragment);
}

async function loadRules() {
  renderRulesLoading();
  try {
    availableRules = await getRules();
    if (!availableRules.length) {
      elements.rulesList.setAttribute('aria-busy', 'false');
      elements.rulesList.replaceChildren(createRulesState(
        'No rules are available right now.',
        'Reload rules',
        loadRules,
      ));
      elements.ruleCount.textContent = 'No rules';
      elements.rulesResults.textContent = 'No rules available.';
      return;
    }
    renderRulesList();
  } catch (error) {
    console.error('Failed to load rules:', error);
    availableRules = [];
    elements.rulesList.setAttribute('aria-busy', 'false');
    const state = createRulesState('Could not load the rule list.', 'Try again', loadRules);
    state.dataset.state = 'error';
    elements.rulesList.replaceChildren(state);
    elements.ruleCount.textContent = 'Rules unavailable';
    elements.rulesResults.textContent = 'The rule list could not be loaded.';
  }
}

function exportConfig(config) {
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'rumdl-config.json';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  setSaveStatus('Settings exported', 'saved');
}

async function importConfig(file) {
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Settings must be a JSON object.');
    }

    const importedConfig = validateConfig(parsed);
    updateUI(importedConfig);
    const savedConfig = await requestSave(importedConfig, 'Settings imported');
    if (!savedConfig) return;
  } catch (error) {
    console.error('Failed to import settings:', error);
    setSaveStatus('Import failed. Choose a valid rumdl JSON file.', 'error');
  }
}

function activateTab(tab, focus = false) {
  const panelId = tab.getAttribute('aria-controls');
  for (const candidate of elements.tabs) {
    const selected = candidate === tab;
    candidate.classList.toggle('active', selected);
    candidate.setAttribute('aria-selected', String(selected));
    candidate.tabIndex = selected ? 0 : -1;
  }

  for (const panel of elements.tabContents) {
    const selected = panel.id === panelId;
    panel.classList.toggle('active', selected);
    panel.hidden = !selected;
  }

  if (focus) tab.focus();
}

function setupTabs() {
  elements.tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateTab(tab));
    tab.addEventListener('keydown', event => {
      let nextIndex = null;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % elements.tabs.length;
      if (event.key === 'ArrowLeft') nextIndex = (index - 1 + elements.tabs.length) % elements.tabs.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = elements.tabs.length - 1;
      if (nextIndex === null) return;
      event.preventDefault();
      activateTab(elements.tabs[nextIndex], true);
    });
  });
}

function setupShortcutLabels() {
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  for (const shortcut of elements.shortcuts) {
    const parts = shortcut.dataset.shortcut.split(',');
    shortcut.textContent = formatShortcut(parts, platform);
  }
}

async function saveFromUI() {
  if (!validateLineLengthField()) {
    setSaveStatus('Line length must be from 40 to 500.', 'error');
    return;
  }
  await requestSave(getConfigFromUI());
}

function setupListeners() {
  if (listenersReady) return;
  listenersReady = true;

  setupTabs();
  setupShortcutLabels();

  for (const control of [
    elements.enabled,
    elements.flavor,
    elements.lineLength,
    elements.showGutterIcons,
    elements.autoFormat,
    elements.reflow,
  ]) {
    control.addEventListener('change', saveFromUI);
  }

  elements.lineLength.addEventListener('input', () => {
    if (validateLineLengthField() && elements.saveStatus.dataset.state === 'error' && !failedSaveConfig) {
      setSaveStatus('Ready', 'idle');
    }
  });

  const saveExpertRules = async () => {
    const config = getConfigFromUI();
    updateUI(config);
    await requestSave(config);
  };
  elements.disabledRules.addEventListener('change', saveExpertRules);
  elements.enabledRules.addEventListener('change', saveExpertRules);

  elements.ruleSearch.addEventListener('input', renderRulesList);

  elements.rulesList.addEventListener('change', async event => {
    const checkbox = event.target.closest('input[type="checkbox"][data-rule]');
    if (!checkbox) return;

    const config = updateRuleSelection(currentConfig, checkbox.dataset.rule, checkbox.checked);
    currentConfig = config;
    elements.disabledRules.value = config.disabledRules.join(', ');
    elements.enabledRules.value = config.enabledRules.join(', ');
    updateRuleMode(config);
    renderRulesList();
    await requestSave(config);
  });

  elements.retrySaveBtn.addEventListener('click', async () => {
    if (!failedSaveConfig) return;
    await requestSave(failedSaveConfig);
  });

  elements.resetBtn.addEventListener('click', async () => {
    if (!confirm('Reset all rumdl settings to their defaults?')) return;
    const defaults = validateConfig(DEFAULT_CONFIG);
    updateUI(defaults);
    await requestSave(defaults, 'Settings reset');
  });

  elements.exportBtn.addEventListener('click', () => exportConfig(currentConfig));
  elements.importBtn.addEventListener('click', () => elements.importFile.click());
  elements.importFile.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (file) await importConfig(file);
    event.target.value = '';
  });

  elements.retryLoadBtn.addEventListener('click', initializeSettings);
}

function showStartupLoading() {
  elements.startupState.dataset.state = 'loading';
  elements.startupState.querySelector('.spinner').hidden = false;
  elements.startupMessage.textContent = 'Loading settings…';
  elements.retryLoadBtn.hidden = true;
  elements.startupState.hidden = false;
  elements.settingsShell.hidden = true;
  elements.mainContent.setAttribute('aria-busy', 'true');
}

async function initializeSettings() {
  showStartupLoading();
  try {
    const config = await loadConfig();
    updateUI(config);
    elements.startupState.hidden = true;
    elements.settingsShell.hidden = false;
    elements.mainContent.setAttribute('aria-busy', 'false');
    setSaveStatus('Ready', 'idle');
    void loadRules();
  } catch (error) {
    console.error('Failed to load settings:', error);
    elements.startupState.dataset.state = 'error';
    elements.startupState.querySelector('.spinner').hidden = true;
    elements.startupMessage.textContent = 'Could not load your settings.';
    elements.retryLoadBtn.hidden = false;
    elements.mainContent.setAttribute('aria-busy', 'false');
    setSaveStatus('Settings unavailable', 'error');
  }
}

function init() {
  setupListeners();
  try {
    const version = chrome.runtime.getManifest().version;
    if (version) {
      elements.version.textContent = `v${version}`;
      elements.version.hidden = false;
    }
  } catch (error) {
    console.error('Failed to read extension version:', error);
  }
  void initializeSettings();
}

init();
