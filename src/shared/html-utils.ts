// HTML utility functions

/**
 * Escape HTML special characters to prevent XSS attacks.
 * Handles the five standard XML entities.
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Escape untrusted text for a quoted HTML attribute.
 * Prefer setAttribute() when constructing DOM directly.
 */
export function escapeHtmlAttribute(text: string): string {
  return escapeHtml(text)
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
