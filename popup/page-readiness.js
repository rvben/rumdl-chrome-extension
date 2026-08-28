function isSupportedUrl(url) {
  if (!url) return false;

  try {
    const hostname = new URL(url).hostname;
    return hostname === 'github.com' || hostname === 'gitlab.com';
  } catch {
    return false;
  }
}

export function resolvePageReadiness({ enabled, url, response }) {
  if (!enabled) {
    return {
      tone: 'paused',
      title: 'rumdl is paused',
      description: 'Turn it on to lint Markdown editors.',
    };
  }

  if (!isSupportedUrl(url)) {
    return {
      tone: 'idle',
      title: 'Open GitHub or GitLab',
      description: 'rumdl activates inside Markdown editors.',
    };
  }

  if (!response || response.type !== 'PAGE_STATUS_RESULT') {
    return {
      tone: 'attention',
      title: 'Reload this tab to activate rumdl',
      description: 'The page was open before rumdl loaded.',
    };
  }

  if (response.status?.serviceWorkerHealthy === false) {
    return {
      tone: 'error',
      title: 'Linting is temporarily unavailable',
      description: 'Type in the editor to retry, or reload the tab.',
    };
  }

  const editorCount = response?.status?.editorCount ?? 0;
  if (editorCount === 0) {
    return {
      tone: 'idle',
      title: 'Ready when the editor opens',
      description: 'Open a Markdown editor on this page.',
    };
  }

  return {
    tone: 'ready',
    title: 'Ready on this page',
    description: `${editorCount} Markdown ${editorCount === 1 ? 'editor' : 'editors'} detected.`,
  };
}

export async function loadPageReadiness({ enabled, tabsApi = chrome.tabs }) {
  if (!enabled) return resolvePageReadiness({ enabled });

  let tab;
  try {
    [tab] = await tabsApi.query({ active: true, currentWindow: true });
  } catch (error) {
    return resolvePageReadiness({ enabled, error });
  }

  if (!tab?.id || !isSupportedUrl(tab.url)) {
    return resolvePageReadiness({ enabled, url: tab?.url });
  }

  try {
    const response = await tabsApi.sendMessage(tab.id, { type: 'GET_PAGE_STATUS' });
    return resolvePageReadiness({ enabled, url: tab.url, response });
  } catch (error) {
    return resolvePageReadiness({ enabled, url: tab.url, error });
  }
}
