import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetChromeMocks } from './setup';
import { WarningPanel } from '../src/content/warning-panel';
import type { LintWarning, LinterConfig } from '../src/shared/types';

describe('WarningPanel', () => {
  let panel: WarningPanel;
  let textarea: HTMLTextAreaElement;
  let config: LinterConfig;

  beforeEach(() => {
    resetChromeMocks();
    panel = new WarningPanel();
    textarea = document.createElement('textarea');
    textarea.value = 'Line 1\nLine 2\nLine 3';
    document.body.appendChild(textarea);
    config = { flavor: 'standard' };
  });

  afterEach(() => {
    panel.destroy();
    textarea.remove();
    // Clean up any remaining panel elements
    document.querySelectorAll('.rumdl-panel').forEach(el => el.remove());
  });

  describe('show', () => {
    it('creates panel element in document body', () => {
      panel.show(textarea, config);

      const panelEl = document.querySelector('.rumdl-panel');
      expect(panelEl).toBeTruthy();
      expect(panelEl?.parentElement).toBe(document.body);
    });

    it('sets ARIA attributes for accessibility', () => {
      panel.show(textarea, config);

      const panelEl = document.querySelector('.rumdl-panel');
      expect(panelEl?.getAttribute('role')).toBe('dialog');
      expect(panelEl?.getAttribute('aria-labelledby')).toBe('rumdl-panel-title');
      expect(panelEl?.getAttribute('tabindex')).toBe('-1');
    });

    it('shows panel with visible class after animation frame', async () => {
      panel.show(textarea, config);

      // Wait for requestAnimationFrame
      await new Promise(resolve => requestAnimationFrame(resolve));

      const panelEl = document.querySelector('.rumdl-panel');
      expect(panelEl?.classList.contains('visible')).toBe(true);
    });

    it('does not create duplicate panels', () => {
      panel.show(textarea, config);
      panel.show(textarea, config);

      const panels = document.querySelectorAll('.rumdl-panel');
      expect(panels.length).toBe(1);
    });
  });

  describe('hide', () => {
    it('removes visible class from panel', () => {
      panel.show(textarea, config);
      panel.hide();

      const panelEl = document.querySelector('.rumdl-panel');
      expect(panelEl?.classList.contains('visible')).toBe(false);
    });

    it('returns focus to textarea', () => {
      panel.show(textarea, config);
      const focusSpy = vi.spyOn(textarea, 'focus');

      panel.hide();

      expect(focusSpy).toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('removes panel from DOM', () => {
      panel.show(textarea, config);
      panel.destroy();

      const panelEl = document.querySelector('.rumdl-panel');
      expect(panelEl).toBeNull();
    });
  });

  describe('updateWarnings', () => {
    const mockWarnings: LintWarning[] = [
      {
        rule_name: 'MD001',
        message: 'Heading levels should increment by one',
        line: 1,
        column: 1,
        end_line: 1,
        end_column: 10,
        severity: 'error',
      },
      {
        rule_name: 'MD013',
        message: 'Line length exceeds 80 characters',
        line: 2,
        column: 81,
        end_line: 2,
        end_column: 100,
        severity: 'warning',
      },
      {
        rule_name: 'MD041',
        message: 'First line should be a top-level heading',
        line: 1,
        column: 1,
        end_line: 1,
        end_column: 5,
        severity: 'info',
      },
    ];

    it('updates warning count display', () => {
      panel.show(textarea, config);
      panel.updateWarnings(mockWarnings);

      const countEl = document.querySelector('.rumdl-count');
      expect(countEl?.textContent).toBe('3');
    });

    it('displays lint time when provided', () => {
      panel.show(textarea, config);
      panel.updateWarnings(mockWarnings, 42);

      const timeEl = document.querySelector('.rumdl-lint-time');
      expect(timeEl?.textContent).toBe('42ms');
    });

    it('shows empty state when no warnings', () => {
      panel.show(textarea, config);
      panel.updateWarnings([]);

      const emptyEl = document.querySelector('.rumdl-empty');
      expect(emptyEl).toBeTruthy();
      expect(emptyEl?.textContent).toContain('No issues');
    });

    it('groups warnings by severity', () => {
      panel.show(textarea, config);
      panel.updateWarnings(mockWarnings);

      const sections = document.querySelectorAll('.rumdl-section-title');
      const sectionTexts = Array.from(sections).map(s => s.textContent);

      expect(sectionTexts).toContain('Errors (1)');
      expect(sectionTexts).toContain('Warnings (1)');
      expect(sectionTexts).toContain('Info (1)');
    });

    it('renders warning details correctly', () => {
      panel.show(textarea, config);
      panel.updateWarnings(mockWarnings);

      const warningEls = document.querySelectorAll('.rumdl-warning');
      expect(warningEls.length).toBe(3);

      const firstWarning = warningEls[0];
      expect(firstWarning?.querySelector('.rumdl-warning-rule')?.textContent).toBe('MD001');
      expect(firstWarning?.querySelector('.rumdl-warning-message')?.textContent).toBe(
        'Heading levels should increment by one'
      );
    });

    it('shows fix button for warnings with fixes', () => {
      const warningsWithFix: LintWarning[] = [
        {
          ...mockWarnings[0],
          fix: {
            range: { start: 0, end: 5 },
            replacement: '# ',
          },
        },
      ];

      panel.show(textarea, config);
      panel.updateWarnings(warningsWithFix);

      const fixBtn = document.querySelector('.rumdl-btn-fix-one');
      expect(fixBtn).toBeTruthy();
    });

    it('disables fix all button when no fixable warnings', () => {
      panel.show(textarea, config);
      panel.updateWarnings(mockWarnings); // None have fixes

      const fixAllBtn = document.querySelector('.rumdl-btn-fix') as HTMLButtonElement;
      expect(fixAllBtn?.disabled).toBe(true);
    });

    it('enables fix all button when fixable warnings exist', () => {
      const warningsWithFix: LintWarning[] = [
        {
          ...mockWarnings[0],
          fix: {
            range: { start: 0, end: 5 },
            replacement: '# ',
          },
        },
      ];

      panel.show(textarea, config);
      panel.updateWarnings(warningsWithFix);

      const fixAllBtn = document.querySelector('.rumdl-btn-fix') as HTMLButtonElement;
      expect(fixAllBtn?.disabled).toBe(false);
    });

    it('adds success class to count when no warnings', () => {
      panel.show(textarea, config);
      panel.updateWarnings([]);

      const countEl = document.querySelector('.rumdl-count');
      expect(countEl?.classList.contains('success')).toBe(true);
    });
  });

  describe('keyboard navigation', () => {
    it('closes panel on Escape key', async () => {
      panel.show(textarea, config);
      await new Promise(resolve => requestAnimationFrame(resolve));

      const panelEl = document.querySelector('.rumdl-panel') as HTMLElement;
      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      panelEl.dispatchEvent(escapeEvent);

      expect(panelEl.classList.contains('visible')).toBe(false);
    });

    it('returns focus to textarea on Escape', async () => {
      panel.show(textarea, config);
      await new Promise(resolve => requestAnimationFrame(resolve));

      const focusSpy = vi.spyOn(textarea, 'focus');
      const panelEl = document.querySelector('.rumdl-panel') as HTMLElement;
      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      panelEl.dispatchEvent(escapeEvent);

      expect(focusSpy).toHaveBeenCalled();
    });
  });

  describe('close button', () => {
    it('closes panel when close button clicked', () => {
      panel.show(textarea, config);

      const closeBtn = document.querySelector('.rumdl-btn-close') as HTMLElement;
      closeBtn.click();

      const panelEl = document.querySelector('.rumdl-panel');
      expect(panelEl?.classList.contains('visible')).toBe(false);
    });
  });

  describe('updateConfig', () => {
    it('updates internal config', () => {
      panel.show(textarea, config);

      const newConfig: LinterConfig = { flavor: 'mkdocs', 'line-length': 100 };
      panel.updateConfig(newConfig);

      // The config is used internally for fix operations
      // We can verify it was stored by checking the panel still works
      panel.updateWarnings([]);
      expect(document.querySelector('.rumdl-empty')).toBeTruthy();
    });
  });

  describe('XSS prevention', () => {
    it('escapes HTML in warning rule name', () => {
      const xssWarning: LintWarning = {
        rule_name: '<script>alert("xss")</script>',
        message: 'Test message',
        line: 1,
        column: 1,
        end_line: 1,
        end_column: 10,
        severity: 'warning',
      };

      panel.show(textarea, config);
      panel.updateWarnings([xssWarning]);

      // Check that the rule name span contains escaped HTML, not raw script tag
      const ruleEl = document.querySelector('.rumdl-warning-rule');
      expect(ruleEl?.innerHTML).toContain('&lt;script&gt;');
      expect(ruleEl?.innerHTML).not.toContain('<script>');
    });

    it('escapes HTML in warning message', () => {
      const xssWarning: LintWarning = {
        rule_name: 'MD001',
        message: '<img src=x onerror=alert("xss")>',
        line: 1,
        column: 1,
        end_line: 1,
        end_column: 10,
        severity: 'warning',
      };

      panel.show(textarea, config);
      panel.updateWarnings([xssWarning]);

      // Check that the message div contains escaped HTML
      const messageEl = document.querySelector('.rumdl-warning-message');
      expect(messageEl?.innerHTML).toContain('&lt;img');
      expect(messageEl?.innerHTML).not.toContain('<img');
    });
  });
});
