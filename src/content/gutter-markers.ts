// Gutter Markers - line number indicators for lint warnings

import type { LintWarning } from '../shared/types.js';

interface GutterState {
  container: HTMLElement;
  resizeObserver: ResizeObserver;
  scrollHandler: () => void;
  lineHeight: number;
}

const gutterStates = new Map<HTMLTextAreaElement, GutterState>();

// Severity colors
const SEVERITY_COLORS = {
  Error: '#f38ba8',
  Warning: '#fab387',
  Info: '#89b4fa'
};

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

    const syncDimensions = () => {
      const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
      container.style.cssText = `
        position: absolute;
        top: ${textarea.offsetTop + paddingTop}px;
        left: ${textarea.offsetLeft - 24}px;
        width: 20px;
        height: ${textarea.offsetHeight - paddingTop}px;
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
      lineHeight
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
      // Use the highest severity for the line
      const severity = this.getHighestSeverity(lineWarningList);

      const marker = document.createElement('div');
      marker.className = `rumdl-gutter-marker rumdl-gutter-${severity.toLowerCase()}`;

      const top = (line - 1) * state.lineHeight;
      marker.style.cssText = `
        position: absolute;
        top: ${top}px;
        left: 0;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: ${SEVERITY_COLORS[severity]};
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: bold;
        color: #1e1e2e;
      `;

      // Show count if multiple warnings on this line
      if (lineWarningList.length > 1) {
        marker.textContent = lineWarningList.length.toString();
      }

      // Tooltip with all warnings on this line
      const tooltipText = lineWarningList
        .map(w => `${w.rule_name || 'rumdl'}: ${w.message}`)
        .join('\n');
      marker.title = tooltipText;

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
