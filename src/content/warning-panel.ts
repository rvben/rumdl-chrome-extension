// Warning Panel - sidebar showing all lint warnings

import type { LintWarning, LinterConfig } from '../shared/types.js';
import { fix } from '../shared/messages.js';
import { escapeHtml, escapeHtmlAttribute } from '../shared/html-utils.js';
import { setTextareaValueIfUnchanged } from './textarea-utils.js';
import { KeyboardShortcuts } from './keyboard-shortcuts.js';

const DEBUG = false;
let panelSequence = 0;
function log(...args: unknown[]): void {
  if (DEBUG) console.log('[rumdl:panel]', ...args);
}

export class WarningPanel {
  private readonly panelId = ++panelSequence;
  private panel: HTMLElement | null = null;
  private content: HTMLElement | null = null;
  private currentWarnings: LintWarning[] = [];
  private textarea: HTMLTextAreaElement | null = null;
  private config: LinterConfig | null = null;
  private lintTime: number = 0;
  private warningSourceValue: string = '';
  private onFixApplied: (() => void) | null = null;
  private onVisibilityChange: ((visible: boolean) => void) | null = null;
  private returnFocusTarget: HTMLElement | null = null;
  private dragHandle: HTMLElement | null = null;
  private dragMouseDown: ((event: MouseEvent) => void) | null = null;
  private dragMouseMove: ((event: MouseEvent) => void) | null = null;
  private dragMouseUp: (() => void) | null = null;
  private viewportChangeHandler: (() => void) | null = null;
  private showFrame: number | null = null;

  /**
   * Set callback for when a fix is applied (triggers immediate re-lint)
   */
  setOnFixApplied(callback: () => void): void {
    this.onFixApplied = callback;
  }

  /**
   * Keep the owning editor state synchronized with panel controls.
   */
  setOnVisibilityChange(callback: (visible: boolean) => void): void {
    this.onVisibilityChange = callback;
  }

  /**
   * Create or show the warning panel
   */
  show(
    textarea: HTMLTextAreaElement,
    config: LinterConfig,
    returnFocusTarget: HTMLElement = textarea
  ): void {
    this.textarea = textarea;
    this.config = config;
    this.returnFocusTarget = returnFocusTarget;

    if (this.panel) {
      this.panel.hidden = false;
      this.panel.inert = false;
      this.panel.setAttribute('aria-hidden', 'false');
      this.positionPanel(textarea);
      this.addViewportListeners();
      this.panel.classList.add('visible');
      this.onVisibilityChange?.(true);
      this.showFrame = requestAnimationFrame(() => {
        this.showFrame = null;
        this.panel?.focus();
      });
      return;
    }

    this.panel = document.createElement('div');
    this.panel.className = 'rumdl-panel';
    this.panel.setAttribute('role', 'dialog');
    const titleId = `rumdl-panel-title-${this.panelId}`;
    const contentId = `rumdl-panel-content-${this.panelId}`;
    this.panel.setAttribute('aria-labelledby', titleId);
    this.panel.setAttribute('aria-hidden', 'true');
    this.panel.setAttribute('tabindex', '-1');
    this.panel.hidden = true;
    this.panel.inert = true;
    const formatShortcut = escapeHtml(KeyboardShortcuts.getShortcutKeys('format'));
    const toggleShortcut = escapeHtml(KeyboardShortcuts.getShortcutKeys('togglePanel'));
    const quickFixShortcut = escapeHtml(KeyboardShortcuts.getShortcutKeys('fixCurrent'));
    const nextShortcut = escapeHtml(KeyboardShortcuts.getShortcutKeys('nextWarning'));
    const previousShortcut = escapeHtml(KeyboardShortcuts.getShortcutKeys('prevWarning'));
    this.panel.innerHTML = `
      <div class="rumdl-panel-header">
        <span class="rumdl-panel-title" id="${titleId}">
          <span class="rumdl-logo">rumdl</span>
          <span class="rumdl-count" aria-live="polite">0</span>
          <span class="rumdl-issues-label">issues</span>
          <span class="rumdl-lint-time" aria-live="polite"></span>
        </span>
        <div class="rumdl-panel-actions">
          <button type="button" class="rumdl-btn rumdl-btn-fix" title="Fix all auto-fixable issues (${formatShortcut})" aria-label="Fix all auto-fixable issues">Fix all</button>
          <button type="button" class="rumdl-btn rumdl-btn-close" title="Close panel (${toggleShortcut})" aria-label="Close panel">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="rumdl-panel-status" role="status" aria-live="polite" hidden></div>
      <div class="rumdl-panel-content" id="${contentId}" role="region" aria-label="Lint warnings"></div>
      <div class="rumdl-panel-footer">
        <div class="rumdl-shortcuts" aria-label="Keyboard shortcuts">
          <span><kbd>${quickFixShortcut}</kbd> Quick fix</span>
          <span><kbd>${nextShortcut}</kbd> Next</span>
          <span><kbd>${previousShortcut}</kbd> Prev</span>
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

    // Keyboard navigation - Escape to close
    this.panel.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.hide();
      }
    });

    // Make panel draggable by header
    const header = this.panel.querySelector('.rumdl-panel-header') as HTMLElement;
    this.makeDraggable(header);

    document.body.appendChild(this.panel);

    // Position panel near the textarea after attachment so its dimensions are available.
    this.positionPanel(textarea);
    this.addViewportListeners();

    // Add visible class after a frame for animation, then focus
    this.showFrame = requestAnimationFrame(() => {
      this.showFrame = null;
      if (!this.panel) return;
      this.panel.hidden = false;
      this.panel.inert = false;
      this.panel.setAttribute('aria-hidden', 'false');
      this.panel?.classList.add('visible');
      this.onVisibilityChange?.(true);
      // Focus the panel for keyboard navigation
      this.panel?.focus();
    });
  }

  /**
   * Hide the warning panel
   */
  hide(): void {
    if (!this.panel) return;
    if (this.showFrame !== null) {
      cancelAnimationFrame(this.showFrame);
      this.showFrame = null;
    }
    this.panel.classList.remove('visible');
    this.panel.setAttribute('aria-hidden', 'true');
    this.panel.inert = true;
    this.panel.hidden = true;
    this.removeViewportListeners();
    this.onVisibilityChange?.(false);
    const focusTarget = this.returnFocusTarget?.isConnected
      ? this.returnFocusTarget
      : this.textarea;
    focusTarget?.focus();
  }

  /**
   * Remove the panel from DOM
   */
  destroy(): void {
    if (this.showFrame !== null) {
      cancelAnimationFrame(this.showFrame);
      this.showFrame = null;
    }
    this.removeDragListeners();
    this.removeViewportListeners();
    this.panel?.remove();
    this.panel = null;
    this.content = null;
    this.currentWarnings = [];
    this.warningSourceValue = '';
    this.textarea = null;
    this.returnFocusTarget = null;
    this.config = null;
    this.onVisibilityChange?.(false);
    this.onVisibilityChange = null;
    this.onFixApplied = null;
  }

  /**
   * Update the config (call when global config changes)
   */
  updateConfig(config: LinterConfig): void {
    this.config = config;
  }

  /**
   * Update the warnings displayed in the panel
   */
  updateWarnings(
    warnings: LintWarning[],
    lintTime: number = 0,
    sourceValue: string = this.textarea?.value ?? ''
  ): void {
    this.currentWarnings = warnings;
    this.lintTime = lintTime;
    this.warningSourceValue = sourceValue;

    if (!this.panel || !this.content) return;

    this.panel.removeAttribute('aria-busy');
    this.setFeedback('', 'neutral');

    // Update count
    const countEl = this.panel.querySelector('.rumdl-count');
    if (countEl) {
      countEl.textContent = warnings.length.toString();
      countEl.classList.toggle('success', warnings.length === 0);
    }
    const labelEl = this.panel.querySelector('.rumdl-issues-label');
    if (labelEl) {
      labelEl.textContent = warnings.length === 1 ? 'issue' : 'issues';
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
        ? `Fix ${fixableCount} auto-fixable issue${fixableCount > 1 ? 's' : ''} (${KeyboardShortcuts.getShortcutKeys('format')})`
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
    const errors = warnings.filter(w => w.severity === 'error');
    const warns = warnings.filter(w => w.severity === 'warning');
    const infos = warnings.filter(w => w.severity === 'info');

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

    this.content.querySelectorAll<HTMLButtonElement>('.rumdl-warning-jump').forEach((button) => {
      const index = parseInt(button.dataset.index || '0', 10);
      button.addEventListener('click', () => this.jumpToWarning(index));
    });
    this.content.querySelectorAll<HTMLButtonElement>('.rumdl-btn-fix-one').forEach((button) => {
      const index = parseInt(button.dataset.index || '0', 10);
      button.addEventListener('click', () => this.fixOne(index));
    });
  }

  /**
   * Render a single warning item
   */
  private renderWarning(warning: LintWarning, index: number): string {
    const severityClass = ['error', 'warning', 'info'].includes(warning.severity)
      ? warning.severity
      : 'warning';
    const ruleName = escapeHtml(warning.rule_name || 'rumdl');
    const accessibleLabel = escapeHtmlAttribute(
      `${warning.rule_name || 'rumdl'}: ${warning.message}`
    );
    return `
      <div class="rumdl-warning" data-index="${index}" role="listitem" aria-label="${accessibleLabel}">
        <button type="button" class="rumdl-warning-jump" data-index="${index}" aria-label="Go to ${accessibleLabel}, line ${warning.line}, column ${warning.column}">
          <span class="rumdl-warning-header">
            <span class="rumdl-warning-rule ${severityClass}">${ruleName}</span>
            <span class="rumdl-warning-location">Ln ${warning.line}, Col ${warning.column}</span>
          </span>
          <span class="rumdl-warning-message">${escapeHtml(warning.message)}</span>
        </button>
        ${warning.fix ? `<button type="button" class="rumdl-btn rumdl-btn-fix-one" data-index="${index}" aria-label="Fix ${accessibleLabel}">Fix</button>` : ''}
      </div>
    `;
  }

  /**
   * Jump to a specific warning location in the textarea
   */
  private jumpToWarning(index: number): void {
    const warning = this.currentWarnings[index];
    if (!warning || !this.textarea) return;

    this.panel?.querySelectorAll('.rumdl-warning-jump[aria-current="true"]')
      .forEach(element => element.removeAttribute('aria-current'));
    this.panel?.querySelector<HTMLButtonElement>(`.rumdl-warning-jump[data-index="${index}"]`)
      ?.setAttribute('aria-current', 'true');

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
    if (value !== this.warningSourceValue) {
      this.setFeedback('Document changed. Rechecking before applying fixes.', 'warning');
      this.onFixApplied?.();
      return;
    }

    const applied = setTextareaValueIfUnchanged(
      this.textarea,
      value,
      value.slice(0, start) + replacement + value.slice(end)
    );

    if (!applied) {
      this.setFeedback('Document changed. Rechecking before applying fixes.', 'warning');
      this.onFixApplied?.();
      return;
    }

    // Trigger immediate re-lint (bypasses debounce)
    this.setFeedback('Fix applied. Rechecking…', 'success');
    this.onFixApplied?.();
  }

  /**
   * Fix all auto-fixable warnings
   */
  private async fixAll(): Promise<void> {
    if (!this.textarea || !this.config) return;

    const fixAllButton = this.panel?.querySelector<HTMLButtonElement>('.rumdl-btn-fix');
    if (fixAllButton) {
      fixAllButton.disabled = true;
      fixAllButton.setAttribute('aria-busy', 'true');
      fixAllButton.textContent = 'Fixing…';
    }
    this.setFeedback('Applying safe fixes…', 'progress');

    try {
      const originalValue = this.textarea.value;
      const fixed = await fix(originalValue, this.config);

      if (fixed !== originalValue) {
        if (!setTextareaValueIfUnchanged(this.textarea, originalValue, fixed)) {
          this.setFeedback('Document changed. Rechecking before applying fixes.', 'warning');
          this.onFixApplied?.();
          return;
        }
        // Trigger immediate re-lint (bypasses debounce)
        this.onFixApplied?.();
        this.setFeedback('Fixes applied. Rechecking…', 'success');
        log('Fix all applied');
      } else {
        this.setFeedback('No additional safe fixes are available.', 'neutral');
      }
    } catch (error) {
      console.error('[rumdl] Fix all failed:', error);
      this.setFeedback('Could not apply fixes. Try again.', 'error');
    } finally {
      if (fixAllButton) {
        fixAllButton.removeAttribute('aria-busy');
        fixAllButton.textContent = 'Fix all';
        fixAllButton.disabled = !this.currentWarnings.some(warning => warning.fix);
      }
    }
  }

  /** Show an in-panel progress state while linting. */
  setLinting(message = 'Checking Markdown…'): void {
    this.panel?.setAttribute('aria-busy', 'true');
    this.setFeedback(message, 'progress');
  }

  /** Show a recoverable linting error without discarding the last useful result. */
  setError(message: string): void {
    this.panel?.removeAttribute('aria-busy');
    this.setFeedback(message, 'error');
  }

  private setFeedback(
    message: string,
    tone: 'neutral' | 'progress' | 'success' | 'warning' | 'error'
  ): void {
    const status = this.panel?.querySelector<HTMLElement>('.rumdl-panel-status');
    if (!status) return;

    status.textContent = message;
    status.hidden = message.length === 0;
    status.dataset.tone = tone;
  }

  /**
   * Position the panel near the textarea.
   * Anchored to the top-right corner of the textarea, overlaying the editor
   * content. This avoids clipping behind site sidebars (GitHub, GitLab).
   */
  private positionPanel(textarea: HTMLTextAreaElement): void {
    if (!this.panel) return;

    const rect = textarea.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const edge = 12;
    const panelWidth = Math.min(360, Math.max(0, viewportWidth - edge * 2));

    // Max height: fit between the textarea top and the viewport bottom
    const availableHeight = Math.max(0, viewportHeight - edge * 2);
    const maxPanelHeight = Math.min(500, availableHeight);

    // Anchor to the top-right of the textarea, inset so it doesn't overflow
    const preferredLeft = rect.right - panelWidth - 8;
    const left = Math.min(
      Math.max(edge, preferredLeft),
      Math.max(edge, viewportWidth - panelWidth - edge)
    );
    const top = Math.min(
      Math.max(edge, rect.top + 4),
      Math.max(edge, viewportHeight - Math.min(160, maxPanelHeight) - edge)
    );

    this.panel.style.cssText = `
      position: fixed;
      top: ${top}px;
      left: ${left}px;
      width: ${panelWidth}px;
      max-height: ${maxPanelHeight}px;
    `;
  }

  private addViewportListeners(): void {
    if (this.viewportChangeHandler) return;

    this.viewportChangeHandler = () => {
      if (this.panel?.classList.contains('visible') && this.textarea) {
        this.positionPanel(this.textarea);
      }
    };
    window.addEventListener('resize', this.viewportChangeHandler);
    window.addEventListener('scroll', this.viewportChangeHandler, true);
  }

  private removeViewportListeners(): void {
    if (!this.viewportChangeHandler) return;
    window.removeEventListener('resize', this.viewportChangeHandler);
    window.removeEventListener('scroll', this.viewportChangeHandler, true);
    this.viewportChangeHandler = null;
  }

  /**
   * Make the panel draggable by its header
   */
  private makeDraggable(handle: HTMLElement): void {
    if (!this.panel) return;

    this.removeDragListeners();

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const onMouseDown = (e: MouseEvent) => {
      // Don't drag if clicking on buttons
      if ((e.target as HTMLElement).closest('button')) return;

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = this.panel!.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;

      // Reset bottom/right positioning to use top/left
      this.panel!.style.bottom = 'auto';
      this.panel!.style.right = 'auto';
      this.panel!.style.left = `${startLeft}px`;
      this.panel!.style.top = `${startTop}px`;

      handle.style.cursor = 'grabbing';
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging || !this.panel) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const panelRect = this.panel.getBoundingClientRect();
      const edge = 8;
      const newLeft = Math.max(edge, Math.min(
        window.innerWidth - panelRect.width - edge,
        startLeft + dx
      ));
      const newTop = Math.max(edge, Math.min(
        window.innerHeight - Math.min(panelRect.height, 80) - edge,
        startTop + dy
      ));

      this.panel.style.left = `${newLeft}px`;
      this.panel.style.top = `${newTop}px`;
    };

    const onMouseUp = () => {
      isDragging = false;
      handle.style.cursor = 'grab';
    };

    handle.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    this.dragHandle = handle;
    this.dragMouseDown = onMouseDown;
    this.dragMouseMove = onMouseMove;
    this.dragMouseUp = onMouseUp;

    handle.style.cursor = 'grab';
  }

  private removeDragListeners(): void {
    if (this.dragHandle && this.dragMouseDown) {
      this.dragHandle.removeEventListener('mousedown', this.dragMouseDown);
    }
    if (this.dragMouseMove) {
      document.removeEventListener('mousemove', this.dragMouseMove);
    }
    if (this.dragMouseUp) {
      document.removeEventListener('mouseup', this.dragMouseUp);
    }

    this.dragHandle = null;
    this.dragMouseDown = null;
    this.dragMouseMove = null;
    this.dragMouseUp = null;
  }
}
