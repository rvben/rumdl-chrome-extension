// Gutter Markers - vertical bars indicating lines with issues
// Uses inline styles instead of CSS classes for Shadow DOM compatibility

import type { LintWarning } from '../shared/types.js';
import { showWarningsTooltip, hideTooltip } from './tooltip.js';

const DEBUG = false;
function log(...args: unknown[]): void {
  if (DEBUG) console.log('[rumdl:gutter]', ...args);
}

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
      log('No parent element for gutter');
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

    // Position bars in left padding area, just before text starts
    const paddingLeft = parseFloat(computedStyle.paddingLeft) || 12;
    const barWidth = 3;
    const gap = 4;
    const gutterLeft = Math.max(2, paddingLeft - barWidth - gap);

    const syncDimensions = () => {
      // Keep container narrow and only in the gutter area to avoid blocking clicks
      container.style.cssText = `
        position: absolute;
        top: ${textarea.offsetTop + paddingTop}px;
        left: ${textarea.offsetLeft + gutterLeft}px;
        width: ${barWidth}px;
        height: ${textarea.offsetHeight - paddingTop * 2}px;
        pointer-events: none;
        overflow: visible;
        z-index: 10;
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
   * Calculate visual Y positions for each line, accounting for text wrapping
   */
  private calculateLinePositions(textarea: HTMLTextAreaElement, lineHeight: number): number[] {
    const content = textarea.value;
    const lines = content.split('\n');
    const computedStyle = getComputedStyle(textarea);

    // Create a hidden div to measure text wrapping
    const measureDiv = document.createElement('div');
    measureDiv.style.cssText = `
      position: absolute;
      visibility: hidden;
      white-space: pre-wrap;
      word-wrap: break-word;
      width: ${textarea.clientWidth - parseFloat(computedStyle.paddingLeft) - parseFloat(computedStyle.paddingRight)}px;
      font: ${computedStyle.font};
      font-family: ${computedStyle.fontFamily};
      font-size: ${computedStyle.fontSize};
      line-height: ${computedStyle.lineHeight};
    `;

    // Append to the appropriate root (handles shadow DOM)
    const rootNode = textarea.getRootNode();
    const appendTarget = rootNode instanceof ShadowRoot
      ? (rootNode.host.parentElement || document.body)
      : document.body;
    appendTarget.appendChild(measureDiv);

    // Calculate cumulative Y position for each line
    const positions: number[] = [];
    let currentY = 0;

    for (const line of lines) {
      positions.push(currentY);
      measureDiv.textContent = line || ' '; // Use space for empty lines
      currentY += measureDiv.offsetHeight;
    }

    appendTarget.removeChild(measureDiv);
    return positions;
  }

  /**
   * Render gutter markers for warnings
   */
  render(
    gutter: HTMLElement,
    textarea: HTMLTextAreaElement,
    warnings: LintWarning[],
    onFix?: (warning: LintWarning) => void
  ): void {
    gutter.innerHTML = '';
    log(`Rendering ${warnings.length} warnings to gutter`);

    if (warnings.length === 0) return;

    const state = gutterStates.get(textarea);
    if (!state) return;

    // Calculate actual visual positions accounting for text wrapping
    const linePositions = this.calculateLinePositions(textarea, state.lineHeight);

    // Group warnings by line
    const lineWarnings = new Map<number, LintWarning[]>();
    for (const warning of warnings) {
      const lineList = lineWarnings.get(warning.line) || [];
      lineList.push(warning);
      lineWarnings.set(warning.line, lineList);
    }

    // Create vertical bar marker for each line with warnings
    for (const [line, lineWarningList] of lineWarnings) {
      const severity = this.getHighestSeverity(lineWarningList);

      // Severity colors (GitHub Primer tokens)
      const severityColors: Record<string, string> = {
        error: '#cf222e',
        warning: '#9a6700',
        info: '#0969da'
      };
      const color = severityColors[severity.toLowerCase()] || severityColors.warning;

      const marker = document.createElement('div');
      // Vertical bar spanning the full line height, with rounded ends
      marker.style.cssText = `
        position: absolute;
        width: 3px;
        border-radius: 2px;
        background-color: ${color};
        pointer-events: auto;
        cursor: pointer;
        transition: box-shadow 0.15s ease, opacity 0.15s ease;
        opacity: 0.8;
      `;

      // Position bar to span the full line height with 2px vertical padding
      const lineY = linePositions[line - 1] ?? (line - 1) * state.lineHeight;
      const verticalPad = 2;
      marker.style.top = `${lineY + verticalPad}px`;
      marker.style.height = `${state.lineHeight - verticalPad * 2}px`;
      marker.style.left = '0px';

      // Hover effect: full opacity + soft glow
      marker.addEventListener('mouseenter', () => {
        marker.style.opacity = '1';
        marker.style.boxShadow = `0 0 6px ${color}`;
        const rect = marker.getBoundingClientRect();
        showWarningsTooltip(lineWarningList, rect.right, rect.top, onFix);
      });
      marker.addEventListener('mouseleave', () => {
        marker.style.opacity = '0.8';
        marker.style.boxShadow = 'none';
        // Delay hide to allow moving to tooltip
        setTimeout(() => {
          const tooltip = document.querySelector('.rumdl-tooltip');
          if (!tooltip?.matches(':hover')) {
            hideTooltip();
          }
        }, 100);
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
  private getHighestSeverity(warnings: LintWarning[]): 'error' | 'warning' | 'info' {
    if (warnings.some(w => w.severity === 'error')) return 'error';
    if (warnings.some(w => w.severity === 'warning')) return 'warning';
    return 'info';
  }
}
