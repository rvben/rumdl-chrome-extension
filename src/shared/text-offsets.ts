import type { LintWarning } from './types.js';

/** WASM positions count Unicode scalar values; textarea selections count UTF-16 units. */
export function characterOffsetToUtf16(content: string, offset: number): number {
  let characters = 0;
  let units = 0;
  for (const character of content) {
    if (characters++ >= offset) break;
    units += character.length;
  }
  return units;
}

/** Normalize fixes once at the transport boundary, leaving human-readable columns intact. */
export function normalizeFixRanges(content: string, warnings: LintWarning[]): LintWarning[] {
  if (!/[\uD800-\uDBFF]/.test(content)) return warnings;
  const offsets = [0];
  let units = 0;
  for (const character of content) {
    units += character.length;
    offsets.push(units);
  }
  return warnings.map(warning => {
    if (!warning.fix) return warning;
    const { start, end } = warning.fix.range;
    const normalizedStart = offsets[start];
    const normalizedEnd = offsets[end];
    // Invalid ranges must not be offered as edits.
    if (normalizedStart === undefined || normalizedEnd === undefined || start > end) {
      const { fix: _fix, ...unfixable } = warning;
      return unfixable;
    }
    return { ...warning, fix: { ...warning.fix, range: { start: normalizedStart, end: normalizedEnd } } };
  });
}
