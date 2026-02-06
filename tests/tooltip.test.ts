import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetChromeMocks } from './setup';
import {
  showTooltip,
  showWarningsTooltip,
  hideTooltip,
  destroyTooltip,
} from '../src/content/tooltip';
import type { LintWarning } from '../src/shared/types';

describe('tooltip', () => {
  beforeEach(() => {
    resetChromeMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    destroyTooltip();
    vi.useRealTimers();
  });

  describe('showTooltip', () => {
    const mockWarning: LintWarning = {
      rule_name: 'MD001',
      message: 'Heading levels should increment by one',
      line: 1,
      column: 1,
      end_line: 1,
      end_column: 10,
      severity: 'warning',
    };

    it('creates tooltip element in document body', () => {
      showTooltip(mockWarning, 100, 100);

      const tooltip = document.querySelector('.rumdl-tooltip');
      expect(tooltip).toBeTruthy();
      expect(tooltip?.parentElement).toBe(document.body);
    });

    it('displays rule name and message', () => {
      showTooltip(mockWarning, 100, 100);

      const tooltip = document.querySelector('.rumdl-tooltip');
      expect(tooltip?.textContent).toContain('MD001');
      expect(tooltip?.textContent).toContain('Heading levels should increment by one');
    });

    it('displays severity', () => {
      showTooltip(mockWarning, 100, 100);

      const tooltip = document.querySelector('.rumdl-tooltip');
      expect(tooltip?.textContent).toContain('warning');
    });

    it('shows quick fix hint when fix available', () => {
      const warningWithFix: LintWarning = {
        ...mockWarning,
        fix: {
          range: { start: 0, end: 5 },
          replacement: '# ',
        },
      };

      showTooltip(warningWithFix, 100, 100);

      const tooltip = document.querySelector('.rumdl-tooltip');
      expect(tooltip?.textContent).toContain('Quick fix available');
    });

    it('does not show quick fix hint when no fix', () => {
      showTooltip(mockWarning, 100, 100);

      const tooltip = document.querySelector('.rumdl-tooltip');
      expect(tooltip?.textContent).not.toContain('Quick fix available');
    });

    it('positions tooltip at specified coordinates', () => {
      showTooltip(mockWarning, 200, 300);

      const tooltip = document.querySelector('.rumdl-tooltip') as HTMLElement;
      expect(tooltip.style.left).toBe('210px'); // x + 10
      expect(tooltip.style.top).toBe('310px'); // y + 10
    });

    it('sets opacity to 1 when shown', () => {
      showTooltip(mockWarning, 100, 100);

      const tooltip = document.querySelector('.rumdl-tooltip') as HTMLElement;
      expect(tooltip.style.opacity).toBe('1');
    });

    it('sets ARIA role to tooltip', () => {
      showTooltip(mockWarning, 100, 100);

      const tooltip = document.querySelector('.rumdl-tooltip');
      expect(tooltip?.getAttribute('role')).toBe('tooltip');
    });

    it('reuses existing tooltip element', () => {
      showTooltip(mockWarning, 100, 100);
      showTooltip(mockWarning, 200, 200);

      const tooltips = document.querySelectorAll('.rumdl-tooltip');
      expect(tooltips.length).toBe(1);
    });

    it('escapes HTML in rule name', () => {
      const xssWarning: LintWarning = {
        ...mockWarning,
        rule_name: '<script>alert("xss")</script>',
      };

      showTooltip(xssWarning, 100, 100);

      const tooltip = document.querySelector('.rumdl-tooltip');
      expect(tooltip?.innerHTML).not.toContain('<script>');
      expect(tooltip?.innerHTML).toContain('&lt;script&gt;');
    });

    it('escapes HTML in message', () => {
      const xssWarning: LintWarning = {
        ...mockWarning,
        message: '<img src=x onerror=alert("xss")>',
      };

      showTooltip(xssWarning, 100, 100);

      const tooltip = document.querySelector('.rumdl-tooltip');
      expect(tooltip?.innerHTML).not.toContain('<img');
    });
  });

  describe('showWarningsTooltip', () => {
    const mockWarnings: LintWarning[] = [
      {
        rule_name: 'MD001',
        message: 'First warning',
        line: 1,
        column: 1,
        end_line: 1,
        end_column: 10,
        severity: 'error',
      },
      {
        rule_name: 'MD013',
        message: 'Second warning',
        line: 1,
        column: 1,
        end_line: 1,
        end_column: 100,
        severity: 'warning',
      },
    ];

    it('displays multiple warnings', () => {
      showWarningsTooltip(mockWarnings, 100, 100);

      const tooltip = document.querySelector('.rumdl-tooltip');
      expect(tooltip?.textContent).toContain('MD001');
      expect(tooltip?.textContent).toContain('MD013');
      expect(tooltip?.textContent).toContain('First warning');
      expect(tooltip?.textContent).toContain('Second warning');
    });

    it('shows fix buttons when onFix callback provided', () => {
      const warningsWithFix: LintWarning[] = [
        {
          ...mockWarnings[0],
          fix: { range: { start: 0, end: 5 }, replacement: '# ' },
        },
      ];

      showWarningsTooltip(warningsWithFix, 100, 100, vi.fn());

      const fixBtn = document.querySelector('.rumdl-tooltip-fix');
      expect(fixBtn).toBeTruthy();
    });

    it('calls onFix callback when fix button clicked', () => {
      const onFix = vi.fn();
      const warningsWithFix: LintWarning[] = [
        {
          ...mockWarnings[0],
          fix: { range: { start: 0, end: 5 }, replacement: '# ' },
        },
      ];

      showWarningsTooltip(warningsWithFix, 100, 100, onFix);

      const fixBtn = document.querySelector('.rumdl-tooltip-fix') as HTMLElement;
      fixBtn.click();

      expect(onFix).toHaveBeenCalledWith(warningsWithFix[0]);
    });

    it('hides tooltip after fix button clicked', () => {
      const onFix = vi.fn();
      const warningsWithFix: LintWarning[] = [
        {
          ...mockWarnings[0],
          fix: { range: { start: 0, end: 5 }, replacement: '# ' },
        },
      ];

      showWarningsTooltip(warningsWithFix, 100, 100, onFix);

      const fixBtn = document.querySelector('.rumdl-tooltip-fix') as HTMLElement;
      fixBtn.click();

      vi.runAllTimers();

      const tooltip = document.querySelector('.rumdl-tooltip') as HTMLElement;
      expect(tooltip.style.opacity).toBe('0');
    });

    it('makes tooltip interactive when onFix provided', () => {
      showWarningsTooltip(mockWarnings, 100, 100, vi.fn());

      const tooltip = document.querySelector('.rumdl-tooltip') as HTMLElement;
      expect(tooltip.style.pointerEvents).toBe('auto');
    });

    it('makes tooltip non-interactive when no onFix', () => {
      showWarningsTooltip(mockWarnings, 100, 100);

      const tooltip = document.querySelector('.rumdl-tooltip') as HTMLElement;
      expect(tooltip.style.pointerEvents).toBe('none');
    });
  });

  describe('hideTooltip', () => {
    it('sets opacity to 0 after delay', () => {
      showTooltip(
        {
          rule_name: 'MD001',
          message: 'Test',
          line: 1,
          column: 1,
          end_line: 1,
          end_column: 5,
          severity: 'warning',
        },
        100,
        100
      );

      hideTooltip();
      vi.runAllTimers();

      const tooltip = document.querySelector('.rumdl-tooltip') as HTMLElement;
      expect(tooltip.style.opacity).toBe('0');
    });

    it('disables pointer events immediately', () => {
      showTooltip(
        {
          rule_name: 'MD001',
          message: 'Test',
          line: 1,
          column: 1,
          end_line: 1,
          end_column: 5,
          severity: 'warning',
        },
        100,
        100
      );

      hideTooltip();

      const tooltip = document.querySelector('.rumdl-tooltip') as HTMLElement;
      expect(tooltip.style.pointerEvents).toBe('none');
    });

    it('does nothing if no tooltip exists', () => {
      // Should not throw
      expect(() => hideTooltip()).not.toThrow();
    });
  });

  describe('destroyTooltip', () => {
    it('removes tooltip from DOM', () => {
      showTooltip(
        {
          rule_name: 'MD001',
          message: 'Test',
          line: 1,
          column: 1,
          end_line: 1,
          end_column: 5,
          severity: 'warning',
        },
        100,
        100
      );

      destroyTooltip();

      const tooltip = document.querySelector('.rumdl-tooltip');
      expect(tooltip).toBeNull();
    });

    it('clears pending hide timeout', () => {
      showTooltip(
        {
          rule_name: 'MD001',
          message: 'Test',
          line: 1,
          column: 1,
          end_line: 1,
          end_column: 5,
          severity: 'warning',
        },
        100,
        100
      );

      hideTooltip();
      destroyTooltip();

      // Should not throw when timers run
      expect(() => vi.runAllTimers()).not.toThrow();
    });
  });
});
