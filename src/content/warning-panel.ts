// Warning Panel - sidebar showing all lint warnings

import type { LintWarning, LinterConfig } from '../shared/types.js';
import { fix } from '../shared/messages.js';
import { escapeHtml } from '../shared/html-utils.js';

export class WarningPanel {
  private panel: HTMLElement | null = null;
  private content: HTMLElement | null = null;
  private currentWarnings: LintWarning[] = [];
  private textarea: HTMLTextAreaElement | null = null;
  private config: LinterConfig | null = null;
  private lintTime: number = 0;

  /**
   * Create or show the warning panel
   */
  show(textarea: HTMLTextAreaElement, config: LinterConfig): void {
    this.textarea = textarea;
    this.config = config;

    if (this.panel) {
      this.panel.classList.add('visible');
      return;
    }

    this.panel = document.createElement('div');
    this.panel.className = 'rumdl-panel';
    this.panel.innerHTML = `
      <div class="rumdl-panel-header">
        <span class="rumdl-panel-title">
          <span class="rumdl-logo">rumdl</span>
          <span class="rumdl-count">0</span>
          <span class="rumdl-issues-label">issues</span>
          <span class="rumdl-lint-time"></span>
        </span>
        <div class="rumdl-panel-actions">
          <button class="rumdl-btn rumdl-btn-fix" title="Fix all auto-fixable issues (⌘⇧F)">Fix all</button>
          <button class="rumdl-btn rumdl-btn-close" title="Close panel (⌘⇧L)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="rumdl-panel-content"></div>
      <div class="rumdl-panel-footer">
        <div class="rumdl-shortcuts">
          <span><kbd>⌘.</kbd> Quick fix</span>
          <span><kbd>⌘⌥]</kbd> Next</span>
          <span><kbd>⌘⌥[</kbd> Prev</span>
        </div>
      </div>
    `;

    this.content = this.panel.querySelector('.rumdl-panel-content');

    // Close button
    const closeBtn = this.panel.querySelector('.rumdl-btn-close');
    closeBtn?.addEventListener('click', () => this.hide());

    // Fix all button
    const fixAllBtn = this.panel.querySelector('.rumdl-btn-fix') as HTMLButtonElement;
    fixAllBtn?.addEventListener('click', () => this.fixAll());

    // Position panel near the textarea
    this.positionPanel(textarea);

    document.body.appendChild(this.panel);

    // Add visible class after a frame for animation
    requestAnimationFrame(() => {
      this.panel?.classList.add('visible');
    });
  }

  /**
   * Hide the warning panel
   */
  hide(): void {
    this.panel?.classList.remove('visible');
  }

  /**
   * Remove the panel from DOM
   */
  destroy(): void {
    this.panel?.remove();
    this.panel = null;
    this.content = null;
    this.currentWarnings = [];
    this.textarea = null;
    this.config = null;
  }

  /**
   * Update the warnings displayed in the panel
   */
  updateWarnings(warnings: LintWarning[], lintTime: number = 0): void {
    this.currentWarnings = warnings;
    this.lintTime = lintTime;

    if (!this.panel || !this.content) return;

    // Update count
    const countEl = this.panel.querySelector('.rumdl-count');
    if (countEl) {
      countEl.textContent = warnings.length.toString();
      countEl.classList.toggle('success', warnings.length === 0);
    }

    // Update lint time
    const timeEl = this.panel.querySelector('.rumdl-lint-time');
    if (timeEl) {
      timeEl.textContent = lintTime > 0 ? `${lintTime.toFixed(0)}ms` : '';
    }

    // Update fix all button state
    const fixAllBtn = this.panel.querySelector('.rumdl-btn-fix') as HTMLButtonElement;
    const fixableCount = warnings.filter(w => w.fix).length;
    if (fixAllBtn) {
      fixAllBtn.disabled = fixableCount === 0;
      fixAllBtn.title = fixableCount > 0
        ? `Fix ${fixableCount} auto-fixable issue${fixableCount > 1 ? 's' : ''} (⌘⇧F)`
        : 'No auto-fixable issues';
    }

    // Render warnings grouped by severity
    if (warnings.length === 0) {
      this.content.innerHTML = `
        <div class="rumdl-empty">
          <svg viewBox="0 0 16 16" width="32" height="32" fill="currentColor">
            <path d="M8 16A8 8 0 1 1 8 0a8 8 0 0 1 0 16Zm3.78-9.72a.751.751 0 0 0-.018-1.042.751.751 0 0 0-1.042-.018L6.75 9.19 5.28 7.72a.751.751 0 0 0-1.042.018.751.751 0 0 0-.018 1.042l2 2a.75.75 0 0 0 1.06 0Z"/>
          </svg>
          <p>No issues</p>
          <span class="rumdl-empty-subtitle">Markdown looks good</span>
        </div>
      `;
      return;
    }

    // Build index map for O(1) lookup
    const indexMap = new Map<LintWarning, number>();
    warnings.forEach((w, i) => indexMap.set(w, i));

    // Group by severity
    const errors = warnings.filter(w => w.severity === 'Error');
    const warns = warnings.filter(w => w.severity === 'Warning');
    const infos = warnings.filter(w => w.severity === 'Info');

    let html = '';

    if (errors.length > 0) {
      html += `<div class="rumdl-section" role="list" aria-label="Errors"><div class="rumdl-section-title error">Errors (${errors.length})</div>`;
      html += errors.map(w => this.renderWarning(w, indexMap.get(w)!)).join('');
      html += '</div>';
    }

    if (warns.length > 0) {
      html += `<div class="rumdl-section" role="list" aria-label="Warnings"><div class="rumdl-section-title warning">Warnings (${warns.length})</div>`;
      html += warns.map(w => this.renderWarning(w, indexMap.get(w)!)).join('');
      html += '</div>';
    }

    if (infos.length > 0) {
      html += `<div class="rumdl-section" role="list" aria-label="Info"><div class="rumdl-section-title info">Info (${infos.length})</div>`;
      html += infos.map(w => this.renderWarning(w, indexMap.get(w)!)).join('');
      html += '</div>';
    }

    this.content.innerHTML = html;

    // Add click handlers
    this.content.querySelectorAll('.rumdl-warning').forEach((el) => {
      const index = parseInt((el as HTMLElement).dataset.index || '0', 10);
      el.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('rumdl-btn-fix-one')) {
          this.fixOne(index);
          return;
        }
        this.jumpToWarning(index);
      });
    });
  }

  /**
   * Render a single warning item
   */
  private renderWarning(warning: LintWarning, index: number): string {
    const severityClass = escapeHtml(warning.severity.toLowerCase());
    const ruleName = escapeHtml(warning.rule_name || 'rumdl');
    return `
      <div class="rumdl-warning" data-index="${index}" role="listitem" aria-label="${ruleName}: ${escapeHtml(warning.message)}">
        <div class="rumdl-warning-header">
          <span class="rumdl-warning-rule ${severityClass}">${ruleName}</span>
          <span class="rumdl-warning-location">Ln ${warning.line}, Col ${warning.column}</span>
        </div>
        <div class="rumdl-warning-message">${escapeHtml(warning.message)}</div>
        ${warning.fix ? `<button class="rumdl-btn rumdl-btn-fix-one" data-index="${index}" aria-label="Fix this issue">Fix</button>` : ''}
      </div>
    `;
  }

  /**
   * Jump to a specific warning location in the textarea
   */
  private jumpToWarning(index: number): void {
    const warning = this.currentWarnings[index];
    if (!warning || !this.textarea) return;

    // Calculate position in textarea
    const lines = this.textarea.value.split('\n');
    let pos = 0;
    for (let i = 0; i < warning.line - 1 && i < lines.length; i++) {
      pos += lines[i].length + 1; // +1 for newline
    }
    pos += warning.column - 1;

    // Set selection and focus
    this.textarea.focus();
    this.textarea.setSelectionRange(pos, pos);

    // Scroll into view - compute line height from textarea styles
    const computedStyle = window.getComputedStyle(this.textarea);
    const lineHeight = parseFloat(computedStyle.lineHeight) || 20;
    const scrollTop = (warning.line - 5) * lineHeight;
    this.textarea.scrollTop = Math.max(0, scrollTop);
  }

  /**
   * Fix a single warning
   */
  private fixOne(index: number): void {
    const warning = this.currentWarnings[index];
    if (!warning?.fix || !this.textarea) return;

    const { start, end } = warning.fix.range;
    const { replacement } = warning.fix;

    // Apply the fix
    const value = this.textarea.value;
    this.textarea.value = value.slice(0, start) + replacement + value.slice(end);

    // Trigger input event to re-lint
    this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /**
   * Fix all auto-fixable warnings
   */
  private async fixAll(): Promise<void> {
    if (!this.textarea || !this.config) return;

    try {
      const fixed = await fix(this.textarea.value, this.config);
      if (fixed !== this.textarea.value) {
        this.textarea.value = fixed;
        this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } catch (error) {
      console.error('[rumdl] Fix all failed:', error);
    }
  }

  /**
   * Position the panel near the textarea
   */
  private positionPanel(textarea: HTMLTextAreaElement): void {
    if (!this.panel) return;

    const rect = textarea.getBoundingClientRect();
    const viewportWidth = window.innerWidth;

    // Position to the right of the textarea if space allows, otherwise bottom-right fixed
    if (rect.right + 320 < viewportWidth) {
      this.panel.style.cssText = `
        position: fixed;
        top: ${Math.max(10, rect.top)}px;
        left: ${rect.right + 10}px;
        max-height: ${Math.min(rect.height, 500)}px;
      `;
    } else {
      this.panel.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        max-height: 400px;
      `;
    }
  }
}
