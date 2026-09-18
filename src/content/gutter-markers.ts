// IDE-style gutter: logical line numbers with lint markers in the preceding column.
import type { LintWarning } from '../shared/types.js';
import { showWarningsTooltip, hideTooltip } from './tooltip.js';

interface GutterState {
  container: HTMLElement;
  parent: HTMLElement;
  markerLayer: HTMLElement;
  numberLayer: HTMLElement;
  warningLayer: HTMLElement;
  cachedContent: string | null;
  cachedWidth: number;
  cachedStyle: string;
  cachedPositions: number[];
  numberedPositions: number[];
  resizeObserver: ResizeObserver;
  scrollHandler: () => void;
  inputHandler: () => void;
  syncDimensions: () => void;
  inputFrame: number | null;
  lineHeight: number;
  paddingTop: number;
  originalPadding: string;
  paddingPriority: string;
  originalBoxSizing: string;
  boxSizingPriority: string;
  warnings: LintWarning[];
  onFix?: (warning: LintWarning) => void;
  source: string;
  width: number;
}

const parentPositions = new WeakMap<HTMLElement, { original: string | null; users: number }>();
const gutterStates = new Map<HTMLTextAreaElement, GutterState>();

export class GutterMarkers {
  createGutter(textarea: HTMLTextAreaElement): HTMLElement {
    const existing = gutterStates.get(textarea);
    if (existing) return existing.container;
    const container = document.createElement('div');
    container.className = 'rumdl-gutter';
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', 'rumdl line numbers and lint markers');
    const markerLayer = document.createElement('div');
    markerLayer.style.cssText = 'position: absolute; inset: 0; pointer-events: none;';
    const numberLayer = document.createElement('div');
    const warningLayer = document.createElement('div');
    markerLayer.append(numberLayer, warningLayer);
    container.append(markerLayer);
    const parent = textarea.parentElement;
    if (!parent) return container;

    let parentPosition = parentPositions.get(parent);
    if (!parentPosition) {
      parentPosition = { original: getComputedStyle(parent).position === 'static' ? parent.style.position : null, users: 0 };
      parentPositions.set(parent, parentPosition);
    }
    parentPosition.users++;
    if (parentPosition.original !== null) parent.style.position = 'relative';
    const initialStyle = getComputedStyle(textarea);
    const basePadding = parseFloat(initialStyle.paddingLeft) || 0;
    const originalPadding = textarea.style.getPropertyValue('padding-left');
    const paddingPriority = textarea.style.getPropertyPriority('padding-left');
    const originalBoxSizing = textarea.style.getPropertyValue('box-sizing');
    const boxSizingPriority = textarea.style.getPropertyPriority('box-sizing');
    // Keep a width:100% editor inside its parent when reserving the rail.
    textarea.style.setProperty('box-sizing', 'border-box', 'important');
    parent.insertBefore(container, textarea);

    const syncDimensions = () => {
      const state = gutterStates.get(textarea);
      const digits = Math.max(2, String(textarea.value.split('\n').length).length);
      const railWidth = 22 + digits * 8;
      textarea.style.setProperty('padding-left', `${Math.max(basePadding, railWidth + 12)}px`, 'important');
      const style = getComputedStyle(textarea);
      const paddingTop = parseFloat(style.paddingTop) || 0;
      if (state) state.paddingTop = paddingTop;
      container.style.cssText = `position:absolute;top:${textarea.offsetTop + textarea.clientTop + paddingTop}px;left:${textarea.offsetLeft + textarea.clientLeft + 2}px;width:${railWidth}px;height:${Math.max(0, textarea.clientHeight - paddingTop - (parseFloat(style.paddingBottom) || 0))}px;pointer-events:none;overflow:hidden;z-index:10;font-family:${style.fontFamily};font-size:12px;`;
    };
    const scrollHandler = () => {
      markerLayer.style.transform = `translateY(-${textarea.scrollTop}px)`;
      const state = gutterStates.get(textarea);
      const style = getComputedStyle(textarea);
      const visibleHeight = Math.max(0, textarea.clientHeight - (state?.paddingTop || 0) - (parseFloat(style.paddingBottom) || 0));
      for (const marker of markerLayer.querySelectorAll<HTMLButtonElement>('.rumdl-gutter-marker')) {
        const top = parseFloat(marker.style.top);
        marker.hidden = top + 10 <= textarea.scrollTop || top >= textarea.scrollTop + visibleHeight;
      }
    };
    const inputHandler = () => {
      const state = gutterStates.get(textarea);
      if (!state || state.inputFrame !== null) return;
      state.inputFrame = requestAnimationFrame(() => {
        state.inputFrame = null;
        // Never show lint markers against newly edited content until it is checked.
        this.render(container, textarea, state.source === textarea.value ? state.warnings : [], state.onFix);
      });
    };
    const resizeObserver = new ResizeObserver(() => {
      const state = gutterStates.get(textarea);
      if (!state) return;
      syncDimensions();
      if (state.width !== textarea.clientWidth) {
        this.render(container, textarea, state.source === textarea.value ? state.warnings : [], state.onFix);
      }
      scrollHandler();
    });
    gutterStates.set(textarea, {
      container, parent, markerLayer, numberLayer, warningLayer, cachedContent: null, cachedWidth: -1, cachedStyle: '', cachedPositions: [], numberedPositions: [], resizeObserver, scrollHandler, inputHandler, syncDimensions,
      inputFrame: null, lineHeight: parseFloat(initialStyle.lineHeight) || 20, paddingTop: 0,
      originalPadding, paddingPriority, originalBoxSizing, boxSizingPriority,
      warnings: [], source: textarea.value, width: -1,
    });
    textarea.addEventListener('scroll', scrollHandler);
    textarea.addEventListener('input', inputHandler);
    this.render(container, textarea, []);
    resizeObserver.observe(textarea);
    return container;
  }

  removeGutter(textarea: HTMLTextAreaElement): void {
    const state = gutterStates.get(textarea);
    if (!state) return;
    state.resizeObserver.disconnect();
    if (state.inputFrame !== null) cancelAnimationFrame(state.inputFrame);
    textarea.removeEventListener('scroll', state.scrollHandler);
    textarea.removeEventListener('input', state.inputHandler);
    state.container.remove();
    if (state.originalPadding) textarea.style.setProperty('padding-left', state.originalPadding, state.paddingPriority);
    else textarea.style.removeProperty('padding-left');
    if (state.originalBoxSizing) textarea.style.setProperty('box-sizing', state.originalBoxSizing, state.boxSizingPriority);
    else textarea.style.removeProperty('box-sizing');
    const parent = state.parent;
    const parentPosition = parentPositions.get(parent);
    if (parent && parentPosition && --parentPosition.users === 0) {
      if (parentPosition.original !== null) parent.style.position = parentPosition.original;
      parentPositions.delete(parent);
    }
    gutterStates.delete(textarea);
  }

  private calculateLinePositions(textarea: HTMLTextAreaElement, state: GutterState): number[] {
    const lines = textarea.value.split('\n');
    const style = getComputedStyle(textarea);
    const layoutStyle = [style.font, style.lineHeight, style.letterSpacing, style.tabSize, style.paddingLeft, style.paddingRight, textarea.wrap].join('|');
    if (state.cachedContent === textarea.value && state.cachedWidth === textarea.clientWidth && state.cachedStyle === layoutStyle) return state.cachedPositions;
    const measure = document.createElement('div');
    measure.style.cssText = `all:initial;position:absolute;visibility:hidden;pointer-events:none;white-space:${textarea.wrap === 'off' ? 'pre' : 'pre-wrap'};overflow-wrap:break-word;width:${Math.max(1, textarea.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0))}px;font:${style.font};line-height:${style.lineHeight};letter-spacing:${style.letterSpacing};tab-size:${style.tabSize};`;
    const probe = document.createElement('span');
    probe.style.display = 'block';
    probe.textContent = ' ';
    const measuredLines = lines.map(line => {
      const element = document.createElement('span');
      element.style.display = 'block';
      element.textContent = line || ' ';
      return element;
    });
    measure.append(probe, ...measuredLines);
    const root = textarea.getRootNode();
    // Use the same root so inherited and shadow-scoped fonts can resolve.
    (root instanceof ShadowRoot ? root : document.body).appendChild(measure);
    state.lineHeight = probe.offsetHeight || parseFloat(style.lineHeight) || 20;
    const positions: number[] = [];
    let y = 0;
    for (const element of measuredLines) {
      positions.push(y);
      y += element.offsetHeight || state.lineHeight;
    }
    measure.remove();
    state.cachedContent = textarea.value;
    state.cachedWidth = textarea.clientWidth;
    state.cachedStyle = layoutStyle;
    state.cachedPositions = positions;
    return positions;
  }

  render(gutter: HTMLElement, textarea: HTMLTextAreaElement, warnings: LintWarning[], onFix?: (warning: LintWarning) => void): void {
    const state = gutterStates.get(textarea);
    if (!state) return;
    state.warnings = warnings;
    state.onFix = onFix;
    state.source = textarea.value;
    state.syncDimensions();
    state.width = textarea.clientWidth;
    const linePositions = this.calculateLinePositions(textarea, state);
    state.warningLayer.replaceChildren();
    // Group warnings by line
    const lineWarnings = new Map<number, LintWarning[]>();
    for (const warning of warnings) {
      const lineList = lineWarnings.get(warning.line) || [];
      lineList.push(warning);
      lineWarnings.set(warning.line, lineList);
    }

    // Attach markers together, after all geometry reads are complete.
    const fragment = document.createDocumentFragment();
    if (state.numberedPositions !== linePositions) {
      const numbers = document.createDocumentFragment();
      for (let index = 0; index < linePositions.length; index++) {
        const number = document.createElement('span');
        number.className = 'rumdl-line-number';
        number.setAttribute('aria-hidden', 'true');
        number.textContent = String(index + 1);
        number.style.cssText = `position:absolute;left:16px;right:6px;top:${linePositions[index]}px;height:${state.lineHeight}px;line-height:${state.lineHeight}px;text-align:right;`;
        numbers.appendChild(number);
      }
      state.numberLayer.replaceChildren(numbers);
      state.numberedPositions = linePositions;
    }
    // Create circle marker for each line with warnings
    for (const [line, lineWarningList] of lineWarnings) {
      const severity = this.getHighestSeverity(lineWarningList);

      // Severity colors (GitHub Primer tokens)
      const severityColors: Record<string, string> = {
        error: '#cf222e',
        warning: '#9a6700',
        info: '#0969da'
      };
      const color = severityColors[severity.toLowerCase()] || severityColors.warning;

      const marker = document.createElement('button');
      marker.type = 'button';
      marker.className = 'rumdl-gutter-marker';
      marker.setAttribute(
        'aria-label',
        `Line ${line}: ${lineWarningList.length} lint issue${lineWarningList.length === 1 ? '' : 's'}. ${lineWarningList.map(warning => `${warning.rule_name}: ${warning.message}`).join(' ')}`
      );
      // Marker column precedes the logical line number.
      marker.style.cssText = `
        position: absolute;
        width: 10px;
        height: 10px;
        padding: 0;
        border: 1px solid rgba(255, 255, 255, 0.72);
        border-radius: 50%;
        background-color: ${color};
        pointer-events: auto;
        cursor: pointer;
        transition: box-shadow 0.15s ease, opacity 0.15s ease;
        opacity: 0.86;
      `;

      // Center the circle vertically on the line.
      const lineY = linePositions[line - 1] ?? (line - 1) * state.lineHeight;
      const top = lineY + (state.lineHeight / 2) - 5;
      marker.style.top = `${top}px`;
      marker.style.left = '1px';

      const showMarkerTooltip = () => {
        marker.style.opacity = '1';
        marker.style.boxShadow = `0 0 0 2px ${color}33`;
        const rect = marker.getBoundingClientRect();
        showWarningsTooltip(lineWarningList, rect.right, rect.top, onFix);
      };

      const scheduleHide = () => {
        marker.style.opacity = '0.86';
        marker.style.boxShadow = 'none';
        setTimeout(() => {
          const tooltip = document.querySelector('.rumdl-tooltip');
          if (!marker.matches(':hover') && !marker.matches(':focus') && !tooltip?.contains(document.activeElement) && !tooltip?.matches(':hover')) {
            hideTooltip();
          }
        }, 100);
      };

      marker.addEventListener('mouseenter', showMarkerTooltip);
      marker.addEventListener('focus', showMarkerTooltip);
      marker.addEventListener('click', showMarkerTooltip);
      marker.addEventListener('mouseleave', () => {
        scheduleHide();
      });
      marker.addEventListener('blur', scheduleHide);
      marker.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          hideTooltip();
          textarea.focus();
        }
      });

      fragment.appendChild(marker);
    }
    state.warningLayer.appendChild(fragment);
    state.scrollHandler();
  }

  /** Clear stale warnings while retaining line numbers, including the empty line. */
  clear(gutter: HTMLElement): void {
    for (const [textarea, state] of gutterStates) {
      if (state.container === gutter) {
        this.render(gutter, textarea, [], state.onFix);
        return;
      }
    }
  }

  private getHighestSeverity(warnings: LintWarning[]): 'error' | 'warning' | 'info' {
    if (warnings.some(warning => warning.severity === 'error')) return 'error';
    if (warnings.some(warning => warning.severity === 'warning')) return 'warning';
    return 'info';
  }
}
