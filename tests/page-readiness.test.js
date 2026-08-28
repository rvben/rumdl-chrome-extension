import { describe, expect, it } from 'vitest';
import { loadPageReadiness, resolvePageReadiness } from '../popup/page-readiness.js';

describe('popup page readiness', () => {
  it('reports a detected Markdown editor as ready', () => {
    expect(resolvePageReadiness({
      enabled: true,
      url: 'https://github.com/rvben/rumdl/edit/main/README.md',
      response: {
        type: 'PAGE_STATUS_RESULT',
        status: { editorCount: 1, enabled: true, serviceWorkerHealthy: true },
      },
    })).toEqual({
      tone: 'ready',
      title: 'Ready on this page',
      description: '1 Markdown editor detected.',
    });
  });

  it('guides users on pages where rumdl does not run', () => {
    expect(resolvePageReadiness({
      enabled: true,
      url: 'https://example.com/docs',
    })).toEqual({
      tone: 'idle',
      title: 'Open GitHub or GitLab',
      description: 'rumdl activates inside Markdown editors.',
    });
  });

  it('asks for a reload when a supported page has no content script', () => {
    expect(resolvePageReadiness({
      enabled: true,
      url: 'https://gitlab.com/rvben/rumdl/-/edit/main/README.md',
      error: new Error('Could not establish connection. Receiving end does not exist.'),
    })).toEqual({
      tone: 'attention',
      title: 'Reload this tab to activate rumdl',
      description: 'The page was open before rumdl loaded.',
    });
  });

  it('explains that rumdl is waiting when no editor is open', () => {
    expect(resolvePageReadiness({
      enabled: true,
      url: 'https://github.com/rvben/rumdl/issues',
      response: {
        type: 'PAGE_STATUS_RESULT',
        status: { editorCount: 0, enabled: true, serviceWorkerHealthy: true },
      },
    })).toEqual({
      tone: 'idle',
      title: 'Ready when the editor opens',
      description: 'Open a Markdown editor on this page.',
    });
  });

  it('shows the paused state before inspecting the active page', () => {
    expect(resolvePageReadiness({
      enabled: false,
      url: 'https://github.com/rvben/rumdl/edit/main/README.md',
    })).toEqual({
      tone: 'paused',
      title: 'rumdl is paused',
      description: 'Turn it on to lint Markdown editors.',
    });
  });

  it('checks the active tab through the extension messaging boundary', async () => {
    const tabsApi = {
      query: async () => [{ id: 42, url: 'https://github.com/rvben/rumdl/issues' }],
      sendMessage: async tabId => {
        expect(tabId).toBe(42);
        return {
          type: 'PAGE_STATUS_RESULT',
          status: { editorCount: 2, enabled: true, serviceWorkerHealthy: true },
        };
      },
    };

    await expect(loadPageReadiness({ enabled: true, tabsApi })).resolves.toEqual({
      tone: 'ready',
      title: 'Ready on this page',
      description: '2 Markdown editors detected.',
    });
  });

  it('surfaces a temporarily unavailable linter', () => {
    expect(resolvePageReadiness({
      enabled: true,
      url: 'https://github.com/rvben/rumdl/edit/main/README.md',
      response: {
        type: 'PAGE_STATUS_RESULT',
        status: { editorCount: 1, enabled: true, serviceWorkerHealthy: false },
      },
    })).toEqual({
      tone: 'error',
      title: 'Linting is temporarily unavailable',
      description: 'Type in the editor to retry, or reload the tab.',
    });
  });
});
