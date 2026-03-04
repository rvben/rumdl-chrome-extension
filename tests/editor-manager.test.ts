import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetChromeMocks } from './setup';
import { EditorManager } from '../src/content/editor-manager';

// Track callback invocations
type CallbackEvent = { editor: HTMLTextAreaElement; event: 'added' | 'removed' };

describe('EditorManager', () => {
  let manager: EditorManager;
  let events: CallbackEvent[];
  let callback: (editor: HTMLTextAreaElement, event: 'added' | 'removed') => void;

  beforeEach(() => {
    resetChromeMocks();
    manager = new EditorManager();
    events = [];
    callback = (editor, event) => events.push({ editor, event });
  });

  afterEach(() => {
    manager.disconnect();
    document.body.innerHTML = '';
  });

  // ---- Helpers ----

  function appendAndObserve(textarea: HTMLTextAreaElement): void {
    document.body.appendChild(textarea);
    manager.observe(callback);
  }

  function expectDetected(textarea: HTMLTextAreaElement): void {
    expect(events).toHaveLength(1);
    expect(events[0].editor).toBe(textarea);
    expect(events[0].event).toBe('added');
    expect(textarea.dataset.rumdlManaged).toBe('true');
  }

  function expectNotDetected(): void {
    expect(events).toHaveLength(0);
  }

  // ================================================================
  // GitHub selectors — every variant
  // ================================================================

  describe('GitHub editor detection', () => {
    it('detects textarea[aria-label="Markdown value"] (new UI)', () => {
      const ta = document.createElement('textarea');
      ta.setAttribute('aria-label', 'Markdown value');
      appendAndObserve(ta);
      expectDetected(ta);
    });

    it('detects .MarkdownInput-module__textArea__ textarea (wrapper)', () => {
      const wrapper = document.createElement('div');
      wrapper.className = 'MarkdownInput-module__textArea__';
      const ta = document.createElement('textarea');
      wrapper.appendChild(ta);
      document.body.appendChild(wrapper);
      manager.observe(callback);
      expectDetected(ta);
    });

    it('detects textarea.prc-Textarea-TextArea-snlco (Primer React)', () => {
      const ta = document.createElement('textarea');
      ta.className = 'prc-Textarea-TextArea-snlco';
      appendAndObserve(ta);
      expectDetected(ta);
    });

    it('detects textarea[name$="[body]"] (generic body fields)', () => {
      const ta = document.createElement('textarea');
      ta.name = 'issue[body]';
      appendAndObserve(ta);
      expectDetected(ta);
    });

    it('detects textarea[name$="[body]"] for PR body', () => {
      const ta = document.createElement('textarea');
      ta.name = 'pull_request[body]';
      appendAndObserve(ta);
      expectDetected(ta);
    });

    it('detects textarea[id*="comment"] (comment fields)', () => {
      const ta = document.createElement('textarea');
      ta.id = 'issue-comment-body';
      appendAndObserve(ta);
      expectDetected(ta);
    });

    it('detects textarea[id*="new_comment"]', () => {
      const ta = document.createElement('textarea');
      ta.id = 'new_comment_field';
      appendAndObserve(ta);
      expectDetected(ta);
    });

    it('detects textarea.js-comment-field', () => {
      const ta = document.createElement('textarea');
      ta.className = 'js-comment-field';
      appendAndObserve(ta);
      expectDetected(ta);
    });

    it('detects textarea[data-paste-markdown]', () => {
      const ta = document.createElement('textarea');
      ta.setAttribute('data-paste-markdown', 'true');
      appendAndObserve(ta);
      expectDetected(ta);
    });

    it('detects textarea.comment-form-textarea (legacy)', () => {
      const ta = document.createElement('textarea');
      ta.className = 'comment-form-textarea';
      appendAndObserve(ta);
      expectDetected(ta);
    });

    it('detects textarea.js-issue-body (legacy)', () => {
      const ta = document.createElement('textarea');
      ta.className = 'js-issue-body';
      appendAndObserve(ta);
      expectDetected(ta);
    });

    it('detects textarea[name="wiki[body]"]', () => {
      const ta = document.createElement('textarea');
      ta.name = 'wiki[body]';
      appendAndObserve(ta);
      expectDetected(ta);
    });

    it('detects textarea[name="discussion[body]"]', () => {
      const ta = document.createElement('textarea');
      ta.name = 'discussion[body]';
      appendAndObserve(ta);
      expectDetected(ta);
    });
  });

  // ================================================================
  // GitLab selectors — every variant
  // ================================================================

  describe('GitLab editor detection', () => {
    it('detects textarea[data-qa-selector="markdown_editor"]', () => {
      const ta = document.createElement('textarea');
      ta.setAttribute('data-qa-selector', 'markdown_editor');
      appendAndObserve(ta);
      expectDetected(ta);
    });

    it('detects textarea.note-textarea', () => {
      const ta = document.createElement('textarea');
      ta.className = 'note-textarea';
      appendAndObserve(ta);
      expectDetected(ta);
    });

    it('detects textarea#note-body', () => {
      const ta = document.createElement('textarea');
      ta.id = 'note-body';
      appendAndObserve(ta);
      expectDetected(ta);
    });

    it('detects textarea.js-markdown-area', () => {
      const ta = document.createElement('textarea');
      ta.className = 'js-markdown-area';
      appendAndObserve(ta);
      expectDetected(ta);
    });

    it('detects textarea[name="wiki[content]"]', () => {
      const ta = document.createElement('textarea');
      ta.name = 'wiki[content]';
      appendAndObserve(ta);
      expectDetected(ta);
    });

    it('detects textarea[name="content"]', () => {
      const ta = document.createElement('textarea');
      ta.name = 'content';
      appendAndObserve(ta);
      expectDetected(ta);
    });

    it('detects textarea[name*="[note]"]', () => {
      const ta = document.createElement('textarea');
      ta.name = 'note_form[note]';
      appendAndObserve(ta);
      expectDetected(ta);
    });

    it('detects textarea.js-gfm-input', () => {
      const ta = document.createElement('textarea');
      ta.className = 'js-gfm-input';
      appendAndObserve(ta);
      expectDetected(ta);
    });

    it('detects textarea[data-supports-quick-actions]', () => {
      const ta = document.createElement('textarea');
      ta.setAttribute('data-supports-quick-actions', 'true');
      appendAndObserve(ta);
      expectDetected(ta);
    });

    it('detects textarea.js-vue-markdown-field', () => {
      const ta = document.createElement('textarea');
      ta.className = 'js-vue-markdown-field';
      appendAndObserve(ta);
      expectDetected(ta);
    });
  });

  // ================================================================
  // Negative cases
  // ================================================================

  describe('ignores non-matching textareas', () => {
    it('does not detect textarea with unrelated class', () => {
      const ta = document.createElement('textarea');
      ta.className = 'search-input';
      appendAndObserve(ta);
      expectNotDetected();
    });

    it('does not detect plain textarea without attributes', () => {
      const ta = document.createElement('textarea');
      appendAndObserve(ta);
      expectNotDetected();
    });

    it('does not detect input elements even with matching name', () => {
      const input = document.createElement('input');
      input.name = 'issue[body]';
      document.body.appendChild(input);
      manager.observe(callback);
      expectNotDetected();
    });

    it('does not detect div with matching class', () => {
      const div = document.createElement('div');
      div.className = 'js-comment-field';
      document.body.appendChild(div);
      manager.observe(callback);
      expectNotDetected();
    });
  });

  // ================================================================
  // Data attribute lifecycle
  // ================================================================

  describe('data attribute lifecycle', () => {
    it('sets data-rumdl-managed="true" on detection', () => {
      const ta = document.createElement('textarea');
      ta.name = 'issue[body]';
      expect(ta.dataset.rumdlManaged).toBeUndefined();

      appendAndObserve(ta);
      expect(ta.dataset.rumdlManaged).toBe('true');
    });

    it('removes data-rumdl-managed on disconnect', () => {
      const ta = document.createElement('textarea');
      ta.name = 'issue[body]';
      appendAndObserve(ta);

      manager.disconnect();
      expect(ta.dataset.rumdlManaged).toBeUndefined();
    });

    it('removes data-rumdl-managed when editor is removed from DOM', () => {
      const ta = document.createElement('textarea');
      ta.name = 'issue[body]';
      appendAndObserve(ta);
      events.length = 0;

      ta.remove();
      manager.rescan();

      expect(ta.dataset.rumdlManaged).toBeUndefined();
    });
  });

  // ================================================================
  // Multiple editors and cross-site detection
  // ================================================================

  describe('multiple editors', () => {
    it('detects editors from both sites simultaneously', () => {
      const github = document.createElement('textarea');
      github.name = 'issue[body]';
      const gitlab = document.createElement('textarea');
      gitlab.className = 'note-textarea';

      document.body.appendChild(github);
      document.body.appendChild(gitlab);
      manager.observe(callback);

      expect(events).toHaveLength(2);
      const editors = events.map(e => e.editor);
      expect(editors).toContain(github);
      expect(editors).toContain(gitlab);
    });

    it('does not double-detect on rescan', () => {
      const ta = document.createElement('textarea');
      ta.name = 'issue[body]';
      appendAndObserve(ta);
      manager.rescan();
      manager.rescan();

      const addedEvents = events.filter(e => e.event === 'added');
      expect(addedEvents).toHaveLength(1);
    });

    it('tracks all editors via getEditors()', () => {
      const t1 = document.createElement('textarea');
      t1.name = 'issue[body]';
      const t2 = document.createElement('textarea');
      t2.className = 'note-textarea';

      document.body.appendChild(t1);
      document.body.appendChild(t2);
      manager.observe(callback);

      expect(manager.getEditors()).toHaveLength(2);
      expect(manager.getEditors()).toContain(t1);
      expect(manager.getEditors()).toContain(t2);
    });
  });

  // ================================================================
  // Disconnect
  // ================================================================

  describe('disconnect', () => {
    it('fires removed for all tracked editors', () => {
      const t1 = document.createElement('textarea');
      t1.name = 'issue[body]';
      const t2 = document.createElement('textarea');
      t2.className = 'note-textarea';

      document.body.appendChild(t1);
      document.body.appendChild(t2);
      manager.observe(callback);
      events.length = 0;

      manager.disconnect();

      const removed = events.filter(e => e.event === 'removed');
      expect(removed).toHaveLength(2);
      expect(removed.map(e => e.editor)).toContain(t1);
      expect(removed.map(e => e.editor)).toContain(t2);
    });

    it('clears known editors', () => {
      const ta = document.createElement('textarea');
      ta.name = 'issue[body]';
      appendAndObserve(ta);
      expect(manager.getEditors()).toHaveLength(1);

      manager.disconnect();
      expect(manager.getEditors()).toHaveLength(0);
    });

    it('stops detecting new editors after disconnect', async () => {
      manager.observe(callback);
      manager.disconnect();
      events.length = 0;

      const ta = document.createElement('textarea');
      ta.name = 'issue[body]';
      document.body.appendChild(ta);

      await new Promise(resolve => setTimeout(resolve, 10));
      expect(events).toHaveLength(0);
    });
  });

  // ================================================================
  // Rescan
  // ================================================================

  describe('rescan', () => {
    it('detects new editors added after initial observe', () => {
      manager.observe(callback);
      expect(events).toHaveLength(0);

      const ta = document.createElement('textarea');
      ta.className = 'js-markdown-area';
      document.body.appendChild(ta);
      manager.rescan();

      expectDetected(ta);
    });

    it('fires removed for editors no longer in DOM', () => {
      const ta = document.createElement('textarea');
      ta.name = 'issue[body]';
      appendAndObserve(ta);
      events.length = 0;

      ta.remove();
      manager.rescan();

      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('removed');
      expect(events[0].editor).toBe(ta);
    });

    it('handles editor replaced by new one', () => {
      const old = document.createElement('textarea');
      old.name = 'issue[body]';
      appendAndObserve(old);
      events.length = 0;

      old.remove();
      const replacement = document.createElement('textarea');
      replacement.name = 'issue[body]';
      document.body.appendChild(replacement);
      manager.rescan();

      const removed = events.filter(e => e.event === 'removed');
      const added = events.filter(e => e.event === 'added');
      expect(removed).toHaveLength(1);
      expect(removed[0].editor).toBe(old);
      expect(added).toHaveLength(1);
      expect(added[0].editor).toBe(replacement);
    });
  });

  // ================================================================
  // Dynamic DOM changes (MutationObserver)
  // ================================================================

  describe('dynamic DOM changes', () => {
    it('detects dynamically added GitHub textarea', async () => {
      manager.observe(callback);

      const ta = document.createElement('textarea');
      ta.name = 'issue[body]';
      document.body.appendChild(ta);

      await new Promise(resolve => setTimeout(resolve, 0));
      expectDetected(ta);
    });

    it('detects dynamically added GitLab textarea', async () => {
      manager.observe(callback);

      const ta = document.createElement('textarea');
      ta.className = 'note-textarea';
      document.body.appendChild(ta);

      await new Promise(resolve => setTimeout(resolve, 0));
      expectDetected(ta);
    });

    it('detects textarea nested inside dynamically added container', async () => {
      manager.observe(callback);

      const container = document.createElement('div');
      const ta = document.createElement('textarea');
      ta.className = 'js-comment-field';
      container.appendChild(ta);
      document.body.appendChild(container);

      await new Promise(resolve => setTimeout(resolve, 0));
      expectDetected(ta);
    });

    it('does not detect dynamically added non-matching textarea', async () => {
      manager.observe(callback);

      const ta = document.createElement('textarea');
      ta.className = 'search-box';
      document.body.appendChild(ta);

      await new Promise(resolve => setTimeout(resolve, 0));
      expectNotDetected();
    });

    it('fires removed when matching textarea is removed', async () => {
      const ta = document.createElement('textarea');
      ta.name = 'issue[body]';
      appendAndObserve(ta);
      events.length = 0;

      ta.remove();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('removed');
    });

    it('fires removed for editor inside removed container', async () => {
      const container = document.createElement('div');
      const ta = document.createElement('textarea');
      ta.className = 'note-textarea';
      container.appendChild(ta);
      document.body.appendChild(container);

      manager.observe(callback);
      expect(events).toHaveLength(1);
      events.length = 0;

      container.remove();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('removed');
      expect(events[0].editor).toBe(ta);
    });

    it('detects multiple textareas added in one container', async () => {
      manager.observe(callback);

      const container = document.createElement('div');
      const ta1 = document.createElement('textarea');
      ta1.name = 'issue[body]';
      const ta2 = document.createElement('textarea');
      ta2.className = 'js-comment-field';
      container.appendChild(ta1);
      container.appendChild(ta2);
      document.body.appendChild(container);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(events).toHaveLength(2);
      expect(events.map(e => e.editor)).toContain(ta1);
      expect(events.map(e => e.editor)).toContain(ta2);
    });
  });

  // ================================================================
  // Selector count verification
  // ================================================================

  describe('selector completeness', () => {
    // Verify we test every selector defined in editor-manager.ts
    // GitHub: 11 selectors, GitLab: 10 selectors = 21 total (1 skipped: wrapper)

    const allSelectors = [
      // GitHub
      { selector: 'textarea[aria-label="Markdown value"]', setup: (ta: HTMLTextAreaElement) => ta.setAttribute('aria-label', 'Markdown value') },
      { selector: '.MarkdownInput-module__textArea__ textarea', setup: (_ta: HTMLTextAreaElement) => { /* needs wrapper, tested separately */ }, skip: true },
      { selector: 'textarea.prc-Textarea-TextArea-snlco', setup: (ta: HTMLTextAreaElement) => { ta.className = 'prc-Textarea-TextArea-snlco'; } },
      { selector: 'textarea[name$="[body]"]', setup: (ta: HTMLTextAreaElement) => { ta.name = 'issue[body]'; } },
      { selector: 'textarea[id*="comment"]', setup: (ta: HTMLTextAreaElement) => { ta.id = 'my-comment'; } },
      { selector: 'textarea[id*="new_comment"]', setup: (ta: HTMLTextAreaElement) => { ta.id = 'new_comment_field'; } },
      { selector: 'textarea.js-comment-field', setup: (ta: HTMLTextAreaElement) => { ta.className = 'js-comment-field'; } },
      { selector: 'textarea[data-paste-markdown]', setup: (ta: HTMLTextAreaElement) => { ta.setAttribute('data-paste-markdown', 'true'); } },
      { selector: 'textarea.comment-form-textarea', setup: (ta: HTMLTextAreaElement) => { ta.className = 'comment-form-textarea'; } },
      { selector: 'textarea.js-issue-body', setup: (ta: HTMLTextAreaElement) => { ta.className = 'js-issue-body'; } },
      { selector: 'textarea[name="wiki[body]"]', setup: (ta: HTMLTextAreaElement) => { ta.name = 'wiki[body]'; } },
      { selector: 'textarea[name="discussion[body]"]', setup: (ta: HTMLTextAreaElement) => { ta.name = 'discussion[body]'; } },
      // GitLab
      { selector: 'textarea[data-qa-selector="markdown_editor"]', setup: (ta: HTMLTextAreaElement) => { ta.setAttribute('data-qa-selector', 'markdown_editor'); } },
      { selector: 'textarea.note-textarea', setup: (ta: HTMLTextAreaElement) => { ta.className = 'note-textarea'; } },
      { selector: 'textarea#note-body', setup: (ta: HTMLTextAreaElement) => { ta.id = 'note-body'; } },
      { selector: 'textarea.js-markdown-area', setup: (ta: HTMLTextAreaElement) => { ta.className = 'js-markdown-area'; } },
      { selector: 'textarea[name="wiki[content]"]', setup: (ta: HTMLTextAreaElement) => { ta.name = 'wiki[content]'; } },
      { selector: 'textarea[name="content"]', setup: (ta: HTMLTextAreaElement) => { ta.name = 'content'; } },
      { selector: 'textarea[name*="[note]"]', setup: (ta: HTMLTextAreaElement) => { ta.name = 'comment[note]'; } },
      { selector: 'textarea.js-gfm-input', setup: (ta: HTMLTextAreaElement) => { ta.className = 'js-gfm-input'; } },
      { selector: 'textarea[data-supports-quick-actions]', setup: (ta: HTMLTextAreaElement) => { ta.setAttribute('data-supports-quick-actions', 'true'); } },
      { selector: 'textarea.js-vue-markdown-field', setup: (ta: HTMLTextAreaElement) => { ta.className = 'js-vue-markdown-field'; } },
    ];

    for (const entry of allSelectors) {
      if ('skip' in entry && entry.skip) continue;

      it(`detects: ${entry.selector}`, () => {
        const ta = document.createElement('textarea');
        entry.setup(ta);
        appendAndObserve(ta);
        expectDetected(ta);
      });
    }
  });
});
