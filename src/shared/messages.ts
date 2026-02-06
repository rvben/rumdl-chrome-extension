// Message passing utilities for extension communication

import type { MessageType, MessageResponse, LintWarning, LinterConfig, RumdlConfig, RuleInfo, ServiceWorkerStatus } from './types.js';

// Send a message to the service worker and wait for response
export async function sendMessage(message: MessageType): Promise<MessageResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: MessageResponse) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

// Convenience functions for specific message types
export async function lint(content: string, config: LinterConfig): Promise<LintWarning[]> {
  const response = await sendMessage({ type: 'LINT', content, config });
  if (response.type === 'LINT_RESULT') {
    return response.warnings;
  } else if (response.type === 'ERROR') {
    throw new Error(response.message);
  }
  throw new Error('Unexpected response type');
}

export async function fix(content: string, config: LinterConfig): Promise<string> {
  const response = await sendMessage({ type: 'FIX', content, config });
  if (response.type === 'FIX_RESULT') {
    return response.content;
  } else if (response.type === 'ERROR') {
    throw new Error(response.message);
  }
  throw new Error('Unexpected response type');
}

export async function getConfig(): Promise<RumdlConfig> {
  const response = await sendMessage({ type: 'GET_CONFIG' });
  if (response.type === 'CONFIG_RESULT') {
    return response.config;
  } else if (response.type === 'ERROR') {
    throw new Error(response.message);
  }
  throw new Error('Unexpected response type');
}

export async function setConfig(config: Partial<RumdlConfig>): Promise<RumdlConfig> {
  const response = await sendMessage({ type: 'SET_CONFIG', config });
  if (response.type === 'CONFIG_RESULT') {
    return response.config;
  } else if (response.type === 'ERROR') {
    throw new Error(response.message);
  }
  throw new Error('Unexpected response type');
}

export async function getVersion(): Promise<string> {
  const response = await sendMessage({ type: 'GET_VERSION' });
  if (response.type === 'VERSION_RESULT') {
    return response.version;
  } else if (response.type === 'ERROR') {
    throw new Error(response.message);
  }
  throw new Error('Unexpected response type');
}

export async function getRules(): Promise<RuleInfo[]> {
  const response = await sendMessage({ type: 'GET_RULES' });
  if (response.type === 'RULES_RESULT') {
    return response.rules;
  } else if (response.type === 'ERROR') {
    throw new Error(response.message);
  }
  throw new Error('Unexpected response type');
}

export async function ping(): Promise<boolean> {
  try {
    const response = await sendMessage({ type: 'PING' });
    return response.type === 'PONG';
  } catch {
    return false;
  }
}

export async function getStatus(): Promise<ServiceWorkerStatus> {
  const response = await sendMessage({ type: 'GET_STATUS' });
  if (response.type === 'STATUS_RESULT') {
    return response.status;
  } else if (response.type === 'ERROR') {
    throw new Error(response.message);
  }
  throw new Error('Unexpected response type');
}
