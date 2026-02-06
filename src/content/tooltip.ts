// Tooltip - rich hover tooltips for lint warnings

import type { LintWarning } from '../shared/types.js';
import { escapeHtml } from '../shared/html-utils.js';

let tooltip: HTMLElement | null = null;
let hideTimeout: number | null = null;

/**
 * Create the tooltip element if it doesn't exist
 */
function ensureTooltip(): HTMLElement {
  if (tooltip) return tooltip;

  tooltip = document.createElement('div');
  tooltip.className = 'rumdl-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.style.cssText = `
    position: fixed;
    z-index: 10000;
    max-width: 400px;
    padding: 8px 12px;
    background: var(--bgColor-emphasis, #24292f);
    color: var(--fgColor-onEmphasis, #ffffff);
    border-radius: 6px;
    font-size: 12px;
    line-height: 1.4;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    pointer-events: none;
    opacity: 0;
    transform: translateY(4px);
    transition: opacity 0.15s ease, transform 0.15s ease;
  `;

  // Hide tooltip when mouse leaves it
  tooltip.addEventListener('mouseleave', () => {
    hideTooltip();
  });

  document.body.appendChild(tooltip);
  return tooltip;
}

/**
 * Show tooltip for a warning
 */
export function showTooltip(warning: LintWarning, x: number, y: number): void {
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }

  const tip = ensureTooltip();

  // Build tooltip content
  const severityColor = {
    Error: '#f38ba8',
    Warning: '#fab387',
    Info: '#89b4fa'
  }[warning.severity];

  const escapedRuleName = escapeHtml(warning.rule_name || 'rumdl');
  const escapedSeverity = escapeHtml(warning.severity);

  tip.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
      <span style="
        display: inline-block;
        padding: 2px 6px;
        border-radius: 4px;
        background: ${severityColor};
        color: #1e1e2e;
        font-size: 11px;
        font-weight: 600;
        font-family: ui-monospace, SFMono-Regular, monospace;
      ">${escapedRuleName}</span>
      <span style="
        color: ${severityColor};
        font-weight: 500;
      ">${escapedSeverity}</span>
    </div>
    <div style="color: #e6edf3;">${escapeHtml(warning.message)}</div>
    ${warning.fix ? `
      <div style="
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid rgba(255,255,255,0.1);
        color: #8b949e;
        font-size: 11px;
      ">
        <kbd style="
          display: inline-block;
          padding: 2px 4px;
          background: rgba(255,255,255,0.1);
          border-radius: 3px;
          font-family: ui-monospace, SFMono-Regular, monospace;
        ">Ctrl+.</kbd> Quick fix available
      </div>
    ` : ''}
  `;

  // Position tooltip
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const tipRect = tip.getBoundingClientRect();

  let left = x + 10;
  let top = y + 10;

  // Adjust if tooltip would go off screen
  if (left + 400 > viewportWidth) {
    left = x - 410;
  }
  if (top + tipRect.height > viewportHeight) {
    top = y - tipRect.height - 10;
  }

  tip.style.left = `${Math.max(10, left)}px`;
  tip.style.top = `${Math.max(10, top)}px`;
  tip.style.opacity = '1';
  tip.style.transform = 'translateY(0)';
}

/**
 * Show tooltip for multiple warnings (used by gutter dots)
 */
export function showWarningsTooltip(
  warnings: LintWarning[],
  x: number,
  y: number,
  onFix?: (warning: LintWarning) => void
): void {
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }

  const tip = ensureTooltip();

  // Make tooltip interactive if we have fix callbacks
  tip.style.pointerEvents = onFix ? 'auto' : 'none';

  const warningsHtml = warnings.map((warning, index) => {
    const severityColor = {
      Error: 'var(--color-danger-fg, #cf222e)',
      Warning: 'var(--color-attention-fg, #9a6700)',
      Info: 'var(--color-accent-fg, #0969da)'
    }[warning.severity];

    const escapedRuleName = escapeHtml(warning.rule_name || 'rumdl');
    const hasFix = warning.fix && onFix;

    return `
      <div class="rumdl-tooltip-warning" data-index="${index}" style="margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px solid var(--color-border-muted, #d0d7de);">
        <div style="display: flex; align-items: center; gap: 8px;">
          ${hasFix ? `
            <button class="rumdl-tooltip-fix" data-index="${index}" style="
              padding: 2px 6px;
              font-size: 11px;
              font-weight: 500;
              color: #fff;
              background: var(--color-success-emphasis, #1f883d);
              border: none;
              border-radius: 4px;
              cursor: pointer;
              flex-shrink: 0;
            ">Fix</button>
          ` : ''}
          <span style="
            color: ${severityColor};
            font-weight: 600;
            font-family: ui-monospace, SFMono-Regular, monospace;
            font-size: 11px;
          ">${escapedRuleName}</span>
        </div>
        <div style="color: var(--color-fg-default, #1f2328); margin-top: 2px;">${escapeHtml(warning.message)}</div>
      </div>
    `;
  }).join('');

  tip.innerHTML = warningsHtml;
  tip.style.background = 'var(--color-canvas-default, #ffffff)';
  tip.style.color = 'var(--color-fg-default, #1f2328)';
  tip.style.border = '1px solid var(--color-border-default, #d0d7de)';

  // Add fix button handlers
  if (onFix) {
    tip.querySelectorAll('.rumdl-tooltip-fix').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt((btn as HTMLElement).dataset.index || '0', 10);
        onFix(warnings[index]);
        hideTooltip();
      });
    });
  }

  // Remove last border
  const lastDiv = tip.querySelector('.rumdl-tooltip-warning:last-child') as HTMLElement;
  if (lastDiv) {
    lastDiv.style.marginBottom = '0';
    lastDiv.style.paddingBottom = '0';
    lastDiv.style.borderBottom = 'none';
  }

  // Position tooltip
  let left = x + 12;
  let top = y - 8;

  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
  tip.style.opacity = '1';
  tip.style.transform = 'translateY(0)';

  // Adjust after rendering if needed
  requestAnimationFrame(() => {
    const tipRect = tip.getBoundingClientRect();
    if (left + tipRect.width > viewportWidth - 10) {
      tip.style.left = `${x - tipRect.width - 12}px`;
    }
    if (top + tipRect.height > viewportHeight - 10) {
      tip.style.top = `${y - tipRect.height + 8}px`;
    }
  });
}

/**
 * Hide the tooltip
 */
export function hideTooltip(): void {
  if (!tooltip) return;

  hideTimeout = window.setTimeout(() => {
    if (tooltip) {
      tooltip.style.opacity = '0';
      tooltip.style.transform = 'translateY(4px)';
    }
    hideTimeout = null;
  }, 100);
}

/**
 * Remove the tooltip element entirely
 */
export function destroyTooltip(): void {
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
  if (tooltip) {
    tooltip.remove();
    tooltip = null;
  }
}
