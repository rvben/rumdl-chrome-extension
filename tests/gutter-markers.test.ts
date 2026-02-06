import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetChromeMocks } from './setup';
import { GutterMarkers } from '../src/content/gutter-markers';
import type { LintWarning } from '../src/shared/types';

// Mock ResizeObserver
class MockResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

describe('GutterMarkers', () => {
  let gutterMarkers: GutterMarkers;
  let textarea: HTMLTextAreaElement;
  let parent: HTMLDivElement;

  beforeEach(() => {
    resetChromeMocks();
    gutterMarkers = new GutterMarkers();

    // Create a textarea within a parent container
    parent = document.createElement('div');
    textarea = document.createElement('textarea');
    textarea.value = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';

    // Set computed styles that the gutter needs
    Object.defineProperty(textarea, 'offsetTop', { value: 10, configurable: true });
    Object.defineProperty(textarea, 'offsetLeft', { value: 20, configurable: true });
    Object.defineProperty(textarea, 'offsetHeight', { value: 200, configurable: true });
    Object.defineProperty(textarea, 'clientWidth', { value: 400, configurable: true });

    parent.appendChild(textarea);
    document.body.appendChild(parent);
  });

  afterEach(() => {
    gutterMarkers.removeGutter(textarea);
    parent.remove();
    // Clean up any remaining gutter elements
    document.querySelectorAll('.rumdl-gutter').forEach(el => el.remove());
  });

  describe('createGutter', () => {
    it('creates gutter element', () => {
      const gutter = gutterMarkers.createGutter(textarea);

      expect(gutter).toBeTruthy();
      expect(gutter.className).toBe('rumdl-gutter');
    });

    it('inserts gutter into parent element', () => {
      const gutter = gutterMarkers.createGutter(textarea);

      expect(gutter.parentElement).toBe(parent);
    });

    it('sets aria-hidden for accessibility', () => {
      const gutter = gutterMarkers.createGutter(textarea);

      expect(gutter.getAttribute('aria-hidden')).toBe('true');
    });

    it('sets parent position to relative if static', () => {
      parent.style.position = 'static';

      gutterMarkers.createGutter(textarea);

      expect(parent.style.position).toBe('relative');
    });

    it('does not change parent position if already positioned', () => {
      parent.style.position = 'absolute';

      gutterMarkers.createGutter(textarea);

      expect(parent.style.position).toBe('absolute');
    });

    it('returns existing gutter if already created', () => {
      const gutter1 = gutterMarkers.createGutter(textarea);
      const gutter2 = gutterMarkers.createGutter(textarea);

      expect(gutter1).toBe(gutter2);
    });

    it('returns empty container if no parent element', () => {
      const orphanTextarea = document.createElement('textarea');
      // Don't append to any parent

      const gutter = gutterMarkers.createGutter(orphanTextarea);

      expect(gutter.className).toBe('rumdl-gutter');
      expect(gutter.parentElement).toBeNull();
    });
  });

  describe('removeGutter', () => {
    it('removes gutter from DOM', () => {
      const gutter = gutterMarkers.createGutter(textarea);
      gutterMarkers.removeGutter(textarea);

      expect(gutter.parentElement).toBeNull();
    });

    it('handles removing non-existent gutter', () => {
      // Should not throw
      expect(() => gutterMarkers.removeGutter(textarea)).not.toThrow();
    });
  });

  describe('render', () => {
    const mockWarnings: LintWarning[] = [
      {
        rule_name: 'MD001',
        message: 'Error on line 1',
        line: 1,
        column: 1,
        end_line: 1,
        end_column: 10,
        severity: 'error',
      },
      {
        rule_name: 'MD013',
        message: 'Warning on line 3',
        line: 3,
        column: 1,
        end_line: 3,
        end_column: 100,
        severity: 'warning',
      },
      {
        rule_name: 'MD041',
        message: 'Info on line 5',
        line: 5,
        column: 1,
        end_line: 5,
        end_column: 5,
        severity: 'info',
      },
    ];

    it('renders markers for each line with warnings', () => {
      const gutter = gutterMarkers.createGutter(textarea);
      gutterMarkers.render(gutter, textarea, mockWarnings);

      const markers = gutter.querySelectorAll('div');
      expect(markers.length).toBe(3);
    });

    it('renders nothing when no warnings', () => {
      const gutter = gutterMarkers.createGutter(textarea);
      gutterMarkers.render(gutter, textarea, []);

      expect(gutter.innerHTML).toBe('');
    });

    it('groups multiple warnings on same line into single marker', () => {
      const sameLineWarnings: LintWarning[] = [
        { ...mockWarnings[0], line: 1 },
        { ...mockWarnings[1], line: 1 },
      ];

      const gutter = gutterMarkers.createGutter(textarea);
      gutterMarkers.render(gutter, textarea, sameLineWarnings);

      const markers = gutter.querySelectorAll('div');
      expect(markers.length).toBe(1);
    });

    it('uses error color for error severity', () => {
      const gutter = gutterMarkers.createGutter(textarea);
      gutterMarkers.render(gutter, textarea, [mockWarnings[0]]);

      const marker = gutter.querySelector('div') as HTMLElement;
      expect(marker.style.backgroundColor).toBe('rgb(207, 34, 46)'); // #cf222e
    });

    it('uses warning color for warning severity', () => {
      const gutter = gutterMarkers.createGutter(textarea);
      gutterMarkers.render(gutter, textarea, [mockWarnings[1]]);

      const marker = gutter.querySelector('div') as HTMLElement;
      expect(marker.style.backgroundColor).toBe('rgb(154, 103, 0)'); // #9a6700
    });

    it('uses info color for info severity', () => {
      const gutter = gutterMarkers.createGutter(textarea);
      gutterMarkers.render(gutter, textarea, [mockWarnings[2]]);

      const marker = gutter.querySelector('div') as HTMLElement;
      expect(marker.style.backgroundColor).toBe('rgb(9, 105, 218)'); // #0969da
    });

    it('uses highest severity when multiple warnings on same line', () => {
      const mixedWarnings: LintWarning[] = [
        { ...mockWarnings[1], line: 1 }, // warning
        { ...mockWarnings[0], line: 1 }, // error
      ];

      const gutter = gutterMarkers.createGutter(textarea);
      gutterMarkers.render(gutter, textarea, mixedWarnings);

      const marker = gutter.querySelector('div') as HTMLElement;
      expect(marker.style.backgroundColor).toBe('rgb(207, 34, 46)'); // error color
    });

    it('sets pointer-events to auto for interactivity', () => {
      const gutter = gutterMarkers.createGutter(textarea);
      gutterMarkers.render(gutter, textarea, mockWarnings);

      const marker = gutter.querySelector('div') as HTMLElement;
      expect(marker.style.pointerEvents).toBe('auto');
    });

    it('sets cursor to pointer', () => {
      const gutter = gutterMarkers.createGutter(textarea);
      gutterMarkers.render(gutter, textarea, mockWarnings);

      const marker = gutter.querySelector('div') as HTMLElement;
      expect(marker.style.cursor).toBe('pointer');
    });

    it('clears existing markers before rendering', () => {
      const gutter = gutterMarkers.createGutter(textarea);

      gutterMarkers.render(gutter, textarea, [mockWarnings[0]]);
      expect(gutter.querySelectorAll('div').length).toBe(1);

      gutterMarkers.render(gutter, textarea, mockWarnings);
      expect(gutter.querySelectorAll('div').length).toBe(3);
    });
  });

  describe('clear', () => {
    it('removes all markers from gutter', () => {
      const gutter = gutterMarkers.createGutter(textarea);
      gutterMarkers.render(gutter, textarea, [
        {
          rule_name: 'MD001',
          message: 'Test',
          line: 1,
          column: 1,
          end_line: 1,
          end_column: 5,
          severity: 'warning',
        },
      ]);

      gutterMarkers.clear(gutter);

      expect(gutter.innerHTML).toBe('');
    });
  });

  describe('severity priority', () => {
    it('error > warning > info', () => {
      const gutter = gutterMarkers.createGutter(textarea);

      // Test error takes priority
      gutterMarkers.render(gutter, textarea, [
        {
          rule_name: 'MD001',
          message: 'Info',
          line: 1,
          column: 1,
          end_line: 1,
          end_column: 5,
          severity: 'info',
        },
        {
          rule_name: 'MD002',
          message: 'Error',
          line: 1,
          column: 1,
          end_line: 1,
          end_column: 5,
          severity: 'error',
        },
        {
          rule_name: 'MD003',
          message: 'Warning',
          line: 1,
          column: 1,
          end_line: 1,
          end_column: 5,
          severity: 'warning',
        },
      ]);

      const marker = gutter.querySelector('div') as HTMLElement;
      expect(marker.style.backgroundColor).toBe('rgb(207, 34, 46)'); // error color
    });

    it('warning > info when no error', () => {
      const gutter = gutterMarkers.createGutter(textarea);

      gutterMarkers.render(gutter, textarea, [
        {
          rule_name: 'MD001',
          message: 'Info',
          line: 1,
          column: 1,
          end_line: 1,
          end_column: 5,
          severity: 'info',
        },
        {
          rule_name: 'MD002',
          message: 'Warning',
          line: 1,
          column: 1,
          end_line: 1,
          end_column: 5,
          severity: 'warning',
        },
      ]);

      const marker = gutter.querySelector('div') as HTMLElement;
      expect(marker.style.backgroundColor).toBe('rgb(154, 103, 0)'); // warning color
    });
  });
});
