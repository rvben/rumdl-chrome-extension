// Gutter Markers - small dots indicating lines with issues

import type { LintWarning } from '../shared/types.js';
import { showWarningsTooltip, hideTooltip } from './tooltip.js';

interface GutterState {
  container: HTMLElement;
  resizeObserver: ResizeObserver;
  scrollHandler: () => void;
  lineHeight: number;
  paddingTop: number;
}

const gutterStates = new Map<HTMLTextAreaElement, GutterState>();

export class GutterMarkers {
  /**
   * Create a gutter container for a textarea
   */
  createGutter(textarea: HTMLTextAreaElement): HTMLElement {
    const existing = gutterStates.get(textarea);
    if (existing) {
      return existing.container;
    }

    const container = document.createElement('div');
    container.className = 'rumdl-gutter';
    container.setAttribute('aria-hidden', 'true');

    const parent = textarea.parentElement;
    if (!parent) {
      return container;
    }

    const parentPosition = getComputedStyle(parent).position;
    if (parentPosition === 'static') {
      parent.style.position = 'relative';
    }

    parent.insertBefore(container, textarea);

    const computedStyle = getComputedStyle(textarea);
    const lineHeight = parseFloat(computedStyle.lineHeight) || 20;
    const paddingTop = parseFloat(computedStyle.paddingTop) || 0;

    const syncDimensions = () => {
      container.style.cssText = `
        position: absolute;
        top: ${textarea.offsetTop + paddingTop}px;
        left: ${textarea.offsetLeft + 4}px;
        width: 8px;
        height: ${textarea.offsetHeight - paddingTop * 2}px;
        pointer-events: none;
        overflow: hidden;
        z-index: 2;
      `;
    };

    syncDimensions();

    const resizeObserver = new ResizeObserver(syncDimensions);
    resizeObserver.observe(textarea);

    const scrollHandler = () => {
      container.style.transform = `translateY(-${textarea.scrollTop}px)`;
    };
    textarea.addEventListener('scroll', scrollHandler);

    gutterStates.set(textarea, {
      container,
      resizeObserver,
      scrollHandler,
      lineHeight,
      paddingTop
    });

    return container;
  }

  /**
   * Remove gutter for a textarea
   */
  removeGutter(textarea: HTMLTextAreaElement): void {
    const state = gutterStates.get(textarea);
    if (!state) return;

    state.resizeObserver.disconnect();
    textarea.removeEventListener('scroll', state.scrollHandler);
    state.container.remove();
    gutterStates.delete(textarea);
  }

  /**
   * Render gutter markers for warnings
   */
  render(gutter: HTMLElement, textarea: HTMLTextAreaElement, warnings: LintWarning[]): void {
    gutter.innerHTML = '';

    if (warnings.length === 0) return;

    const state = gutterStates.get(textarea);
    if (!state) return;

    // Group warnings by line
    const lineWarnings = new Map<number, LintWarning[]>();
    for (const warning of warnings) {
      const lineList = lineWarnings.get(warning.line) || [];
      lineList.push(warning);
      lineWarnings.set(warning.line, lineList);
    }

    // Create marker for each line with warnings
    for (const [line, lineWarningList] of lineWarnings) {
      const severity = this.getHighestSeverity(lineWarningList);

      const marker = document.createElement('div');
      marker.className = `rumdl-gutter-dot rumdl-gutter-${severity.toLowerCase()}`;

      // Center the dot vertically on the line
      const top = (line - 1) * state.lineHeight + (state.lineHeight / 2) - 4;
      marker.style.top = `${top}px`;

      // Custom tooltip on hover
      marker.addEventListener('mouseenter', (e) => {
        const rect = marker.getBoundingClientRect();
        showWarningsTooltip(lineWarningList, rect.right, rect.top);
      });
      marker.addEventListener('mouseleave', () => {
        hideTooltip();
      });

      gutter.appendChild(marker);
    }
  }

  /**
   * Clear all markers from a gutter
   */
  clear(gutter: HTMLElement): void {
    gutter.innerHTML = '';
  }

  /**
   * Get the highest severity from a list of warnings
   */
  private getHighestSeverity(warnings: LintWarning[]): 'Error' | 'Warning' | 'Info' {
    if (warnings.some(w => w.severity === 'Error')) return 'Error';
    if (warnings.some(w => w.severity === 'Warning')) return 'Warning';
    return 'Info';
  }
}
