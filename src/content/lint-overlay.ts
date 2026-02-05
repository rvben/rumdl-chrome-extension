// Lint Overlay - visual decorations for lint warnings

import type { LintWarning } from '../shared/types.js';

// Map to store overlay state per textarea
interface OverlayState {
  container: HTMLElement;
  resizeObserver: ResizeObserver;
  scrollHandler: () => void;
  charWidth: number;
  lineHeight: number;
}

const overlayStates = new Map<HTMLTextAreaElement, OverlayState>();

// Severity colors (Catppuccin-inspired)
const SEVERITY_COLORS = {
  Error: '#f38ba8',
  Warning: '#fab387',
  Info: '#89b4fa'
};

export class LintOverlay {
  /**
   * Create an overlay container for a textarea
   */
  createOverlay(textarea: HTMLTextAreaElement): HTMLElement {
    // Check if overlay already exists
    const existing = overlayStates.get(textarea);
    if (existing) {
      return existing.container;
    }

    // Create overlay container
    const container = document.createElement('div');
    container.className = 'rumdl-overlay-container';
    container.setAttribute('aria-hidden', 'true');

    // Position relative to textarea's parent
    const parent = textarea.parentElement;
    if (!parent) {
      console.error('[rumdl] Textarea has no parent element');
      return container;
    }

    // Ensure parent has relative positioning for overlay positioning
    const parentPosition = getComputedStyle(parent).position;
    if (parentPosition === 'static') {
      parent.style.position = 'relative';
    }

    // Insert overlay before textarea so it's behind it
    parent.insertBefore(container, textarea);

    // Measure textarea metrics
    const computedStyle = getComputedStyle(textarea);
    const charWidth = this.measureCharWidth(textarea);
    const lineHeight = parseFloat(computedStyle.lineHeight) || 20;

    // Sync overlay dimensions with textarea
    const syncDimensions = () => {
      const rect = textarea.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();

      container.style.cssText = `
        position: absolute;
        top: ${textarea.offsetTop}px;
        left: ${textarea.offsetLeft}px;
        width: ${textarea.offsetWidth}px;
        height: ${textarea.offsetHeight}px;
        pointer-events: none;
        overflow: hidden;
        box-sizing: border-box;
        padding: ${computedStyle.padding};
        font-family: ${computedStyle.fontFamily};
        font-size: ${computedStyle.fontSize};
        line-height: ${computedStyle.lineHeight};
      `;
    };

    syncDimensions();

    // Handle textarea resize
    const resizeObserver = new ResizeObserver(syncDimensions);
    resizeObserver.observe(textarea);

    // Handle scroll synchronization
    const scrollHandler = () => {
      container.scrollTop = textarea.scrollTop;
      container.scrollLeft = textarea.scrollLeft;
    };
    textarea.addEventListener('scroll', scrollHandler);

    // Store state
    overlayStates.set(textarea, {
      container,
      resizeObserver,
      scrollHandler,
      charWidth,
      lineHeight
    });

    return container;
  }

  /**
   * Remove overlay for a textarea
   */
  removeOverlay(textarea: HTMLTextAreaElement): void {
    const state = overlayStates.get(textarea);
    if (!state) return;

    state.resizeObserver.disconnect();
    textarea.removeEventListener('scroll', state.scrollHandler);
    state.container.remove();
    overlayStates.delete(textarea);
  }

  /**
   * Render lint warnings in the overlay
   */
  render(overlay: HTMLElement, textarea: HTMLTextAreaElement, warnings: LintWarning[]): void {
    overlay.innerHTML = '';

    if (warnings.length === 0) return;

    const state = overlayStates.get(textarea);
    if (!state) return;

    const computedStyle = getComputedStyle(textarea);
    const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
    const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;

    // Create marker for each warning
    for (const warning of warnings) {
      const marker = document.createElement('div');
      marker.className = `rumdl-marker rumdl-${warning.severity.toLowerCase()}`;

      // Calculate position based on line/column
      // Lines and columns are 1-indexed from the linter
      const lineIndex = warning.line - 1;
      const colIndex = warning.column - 1;
      const endColIndex = warning.end_column - 1;

      const top = lineIndex * state.lineHeight + paddingTop;
      const left = colIndex * state.charWidth + paddingLeft;
      const width = Math.max((endColIndex - colIndex) * state.charWidth, state.charWidth);

      marker.style.cssText = `
        position: absolute;
        top: ${top + state.lineHeight - 3}px;
        left: ${left}px;
        width: ${width}px;
        height: 2px;
        background: ${SEVERITY_COLORS[warning.severity]};
        border-radius: 1px;
      `;

      // Add tooltip
      marker.title = `${warning.rule_name || 'rumdl'}: ${warning.message}`;

      overlay.appendChild(marker);
    }
  }

  /**
   * Clear all warnings from an overlay
   */
  clear(overlay: HTMLElement): void {
    overlay.innerHTML = '';
  }

  /**
   * Measure the width of a character in the textarea
   */
  private measureCharWidth(textarea: HTMLTextAreaElement): number {
    const computedStyle = getComputedStyle(textarea);

    // Create a hidden span to measure character width
    const span = document.createElement('span');
    span.style.cssText = `
      position: absolute;
      visibility: hidden;
      white-space: pre;
      font-family: ${computedStyle.fontFamily};
      font-size: ${computedStyle.fontSize};
      font-weight: ${computedStyle.fontWeight};
      letter-spacing: ${computedStyle.letterSpacing};
    `;
    span.textContent = 'x'.repeat(100);

    document.body.appendChild(span);
    const width = span.offsetWidth / 100;
    document.body.removeChild(span);

    return width || 8; // Default to 8px if measurement fails
  }
}
