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
    console.log('[rumdl] Gutter parent element:', parent?.tagName, parent);
    if (!parent) {
      console.log('[rumdl] No parent element for gutter');
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

    // Position dots in left padding area, just before text starts
    // paddingLeft is where text begins, so place dots at paddingLeft - dotWidth - gap
    const paddingLeft = parseFloat(computedStyle.paddingLeft) || 12;
    const dotWidth = 6;
    const gap = 4;
    const gutterLeft = Math.max(2, paddingLeft - dotWidth - gap);

    const syncDimensions = () => {
      // Keep container narrow and only in the gutter area to avoid blocking clicks
      container.style.cssText = `
        position: absolute;
        top: ${textarea.offsetTop + paddingTop}px;
        left: ${textarea.offsetLeft + gutterLeft}px;
        width: ${dotWidth}px;
        height: ${textarea.offsetHeight - paddingTop * 2}px;
        pointer-events: none;
        overflow: visible;
        z-index: 10;
      `;
    };

    syncDimensions();
    console.log('[rumdl] Gutter positioned:', container.style.cssText);

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
    console.log(`[rumdl] Rendering ${warnings.length} warnings to gutter`);

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

    // Create marker for each line with warnings
    for (const [line, lineWarningList] of lineWarnings) {
      const severity = this.getHighestSeverity(lineWarningList);

      // Severity colors
      const severityColors: Record<string, string> = {
        error: '#cf222e',
        warning: '#9a6700',
        info: '#0969da'
      };
      const color = severityColors[severity.toLowerCase()] || severityColors.warning;

      const marker = document.createElement('div');
      // Use inline styles for shadow DOM compatibility
      marker.style.cssText = `
        position: absolute;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background-color: ${color};
        pointer-events: auto;
        cursor: pointer;
        transition: transform 0.1s ease;
        box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.8);
      `;

      // Get the visual Y position for this line, center the dot (6px dot = 3px offset)
      const lineY = linePositions[line - 1] ?? (line - 1) * state.lineHeight;
      const top = lineY + (state.lineHeight / 2) - 3;
      marker.style.top = `${top}px`;
      marker.style.left = '0px';

      // Hover effect
      marker.addEventListener('mouseenter', () => {
        marker.style.transform = 'scale(1.3)';
        const rect = marker.getBoundingClientRect();
        showWarningsTooltip(lineWarningList, rect.right, rect.top, onFix);
      });
      marker.addEventListener('mouseleave', () => {
        marker.style.transform = 'scale(1)';
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
