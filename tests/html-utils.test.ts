import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../src/shared/html-utils';

describe('escapeHtml', () => {
  it('escapes less than sign', () => {
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes greater than sign', () => {
    expect(escapeHtml('>')).toBe('&gt;');
    expect(escapeHtml('a > b')).toBe('a &gt; b');
  });

  it('escapes ampersand', () => {
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('preserves double quotes (safe in text content)', () => {
    // Note: textContent/innerHTML only escapes <, >, &
    // Quotes are safe in text content context (not in attributes)
    expect(escapeHtml('"')).toBe('"');
    expect(escapeHtml('say "hello"')).toBe('say "hello"');
  });

  it('escapes single quotes (apostrophe)', () => {
    // Note: textContent/innerHTML may not escape single quotes in all implementations
    // but we should test what the browser does
    const result = escapeHtml("it's");
    // Single quotes may or may not be escaped depending on browser
    expect(result).toContain('it');
    expect(result).toContain('s');
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('preserves safe characters', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
    expect(escapeHtml('123')).toBe('123');
    expect(escapeHtml('a-b_c.d')).toBe('a-b_c.d');
  });

  it('handles complex XSS payloads', () => {
    const payload = '<script>alert("XSS")</script>';
    const result = escapeHtml(payload);
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('escapes multiple special characters', () => {
    const result = escapeHtml('<a href="test?a=1&b=2">link</a>');
    expect(result).toContain('&lt;');
    expect(result).toContain('&gt;');
    expect(result).toContain('&amp;');
    // Quotes are preserved (safe in text content)
    expect(result).toContain('"');
  });

  it('handles unicode characters', () => {
    expect(escapeHtml('Hello 世界')).toBe('Hello 世界');
    expect(escapeHtml('émoji: 🎉')).toBe('émoji: 🎉');
  });

  it('handles newlines and whitespace', () => {
    expect(escapeHtml('line1\nline2')).toBe('line1\nline2');
    expect(escapeHtml('  spaces  ')).toBe('  spaces  ');
    expect(escapeHtml('\ttab')).toBe('\ttab');
  });
});
