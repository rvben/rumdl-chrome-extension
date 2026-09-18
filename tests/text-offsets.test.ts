import { describe, expect, it } from 'vitest';
import { characterOffsetToUtf16, normalizeFixRanges } from '../src/shared/text-offsets';
import type { LintWarning } from '../src/shared/types';

describe('WASM Unicode offsets', () => {
  it('maps astral characters without treating accented or CJK text as multiple units', () => {
    expect(characterOffsetToUtf16('Café 😀 漢字.', 10)).toBe(11);
    expect(characterOffsetToUtf16('😀😃text', 2)).toBe(4);
    expect(characterOffsetToUtf16('plain', 0)).toBe(0);
  });
  it('removes exactly trailing spaces after emoji without changing document content', () => {
    const content = '# Title\n\nCafé 😀 漢字.   \n';
    const warning: LintWarning = { rule_name: 'MD009', message: 'Trailing spaces', line: 3, column: 11, end_line: 3, end_column: 14, severity: 'warning', fix: { range: { start: 19, end: 22 }, replacement: '' } };
    const normalized = normalizeFixRanges(content, [warning])[0];
    const fix = normalized.fix!;
    expect(content.slice(0, fix.range.start) + fix.replacement + content.slice(fix.range.end)).toBe('# Title\n\nCafé 😀 漢字.\n');
    expect(normalized.column).toBe(11);
    expect(warning.fix?.range.start).toBe(19);
  });
  it('does not offer malformed fix ranges', () => {
    const warning: LintWarning = { message: 'Invalid', line: 1, column: 1, end_line: 1, end_column: 1, severity: 'warning', fix: { range: { start: 0, end: 999 }, replacement: '' } };
    expect(normalizeFixRanges('😀', [warning])[0].fix).toBeUndefined();
  });
});
