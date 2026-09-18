// Tooltip - rich hover tooltips for lint warnings

import type { LintWarning } from '../shared/types.js';
import { escapeHtml, escapeHtmlAttribute } from '../shared/html-utils.js';
import { KeyboardShortcuts } from './keyboard-shortcuts.js';

let tooltip: HTMLElement | null = null;
let hideTimeout: number | null = null;
let focusOrigin: HTMLElement | null = null;

/**
 * Create the tooltip element if it doesn't exist
 */
function ensureTooltip(): HTMLElement {
  if (tooltip) return tooltip;

  tooltip = document.createElement('div');
  tooltip.className = 'rumdl-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.inert = true;
  tooltip.style.cssText = `
    position: fixed;
    pointer-events: none;
    opacity: 0;
    transform: translateY(4px);
  `;

  tooltip.addEventListener('mouseenter', () => {
    if (hideTimeout !== null) clearTimeout(hideTimeout);
    hideTimeout = null;
    if (!tooltip?.inert) tooltip!.style.pointerEvents = 'auto';
  });
  tooltip.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      hideTooltip();
    }
  });

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
  tip.inert = false;
  tip.setAttribute('role', 'tooltip');
  tip.removeAttribute('aria-label');
  tip.style.pointerEvents = 'none';

  const escapedRuleName = escapeHtml(warning.rule_name || 'rumdl');
  const severityClass = ['error', 'warning', 'info'].includes(warning.severity)
    ? warning.severity
    : 'warning';
  const escapedSeverity = escapeHtml(warning.severity);
  const quickFixShortcut = escapeHtml(KeyboardShortcuts.getShortcutKeys('fixCurrent'));

  tip.innerHTML = `
    <div class="rumdl-tooltip-header">
      <span class="rumdl-tooltip-rule ${severityClass}">${escapedRuleName}</span>
      <span>${escapedSeverity}</span>
    </div>
    <div class="rumdl-tooltip-message">${escapeHtml(warning.message)}</div>
    ${warning.fix ? `
      <div class="rumdl-tooltip-hint">
        <kbd>${quickFixShortcut}</kbd> Quick fix available
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
  if (left + Math.max(tipRect.width, 360) > viewportWidth) {
    left = x - Math.max(tipRect.width, 360) - 10;
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

  tip.inert = false;
  tip.setAttribute('role', onFix ? 'dialog' : 'tooltip');
  if (onFix) tip.setAttribute('aria-label', 'Lint issues and quick fixes');
  else tip.removeAttribute('aria-label');
  focusOrigin = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  // Make tooltip interactive if we have fix callbacks
  tip.style.pointerEvents = onFix ? 'auto' : 'none';

  const warningsHtml = warnings.map((warning, index) => {
    const escapedRuleName = escapeHtml(warning.rule_name || 'rumdl');
    const escapedRuleAttribute = escapeHtmlAttribute(warning.rule_name || 'rumdl');
    const severityClass = ['error', 'warning', 'info'].includes(warning.severity)
      ? warning.severity
      : 'warning';
    const hasFix = warning.fix && onFix;

    return `
      <div class="rumdl-tooltip-warning" data-index="${index}">
        <div class="rumdl-tooltip-header">
          ${hasFix ? `
            <button type="button" class="rumdl-btn rumdl-tooltip-fix" data-index="${index}" aria-label="Fix ${escapedRuleAttribute}">Fix</button>
          ` : ''}
          <span class="rumdl-tooltip-rule ${severityClass}">${escapedRuleName}</span>
        </div>
        <div class="rumdl-tooltip-message">${escapeHtml(warning.message)}</div>
      </div>
    `;
  }).join('');

  tip.innerHTML = warningsHtml;
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

  // Position tooltip
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  let left = x + 12;
  let top = Math.max(10, y - 8);

  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
  tip.style.opacity = '1';
  tip.style.transform = 'translateY(0)';

  // Adjust after rendering if needed
  requestAnimationFrame(() => {
    if (tip.inert || !tip.isConnected) return;
    const tipRect = tip.getBoundingClientRect();
    if (left + tipRect.width > viewportWidth - 10) {
      tip.style.left = `${Math.max(10, x - tipRect.width - 12)}px`;
    }
    if (top + tipRect.height > viewportHeight - 10) {
      tip.style.top = `${Math.max(10, y - tipRect.height + 8)}px`;
    }
  });
}

/**
 * Hide the tooltip
 */
export function hideTooltip(): void {
  if (!tooltip) return;

  if (hideTimeout !== null) clearTimeout(hideTimeout);
  if (tooltip.contains(document.activeElement) && focusOrigin?.isConnected) focusOrigin.focus();
  tooltip.inert = true;
  // Immediately disable pointer events to prevent blocking clicks
  tooltip.style.pointerEvents = 'none';

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
    focusOrigin = null;
  }
}
