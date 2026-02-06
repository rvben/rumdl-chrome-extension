// Error notification component for displaying user-visible errors

let notificationElement: HTMLElement | null = null;

/**
 * Show an error notification to the user
 */
export function showErrorNotification(message: string, details?: string): void {
  // Remove existing notification if any
  hideErrorNotification();

  notificationElement = document.createElement('div');
  notificationElement.className = 'rumdl-error-notification';
  notificationElement.setAttribute('role', 'alert');
  notificationElement.setAttribute('aria-live', 'assertive');

  notificationElement.innerHTML = `
    <div class="rumdl-error-content">
      <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
        <path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575L6.457 1.047zM8 5a.75.75 0 0 0-.75.75v2.5a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8 5zm1 6a1 1 0 1 0-2 0 1 1 0 0 0 2 0z"/>
      </svg>
      <div class="rumdl-error-text">
        <strong>rumdl:</strong> ${escapeHtml(message)}
        ${details ? `<div class="rumdl-error-details">${escapeHtml(details)}</div>` : ''}
      </div>
      <button class="rumdl-error-close" aria-label="Dismiss error" title="Dismiss">×</button>
    </div>
  `;

  // Add styles inline for shadow DOM compatibility
  const style = document.createElement('style');
  style.textContent = `
    .rumdl-error-notification {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 999999;
      max-width: 400px;
      background: #cf222e;
      color: #fff;
      border-radius: 6px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      animation: rumdl-slide-in 0.3s ease-out;
    }
    @keyframes rumdl-slide-in {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    .rumdl-error-content {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px 16px;
    }
    .rumdl-error-content svg {
      flex-shrink: 0;
      margin-top: 2px;
    }
    .rumdl-error-text {
      flex: 1;
      line-height: 1.4;
    }
    .rumdl-error-details {
      margin-top: 4px;
      font-size: 12px;
      opacity: 0.9;
    }
    .rumdl-error-close {
      flex-shrink: 0;
      background: none;
      border: none;
      color: #fff;
      font-size: 20px;
      cursor: pointer;
      padding: 0;
      line-height: 1;
      opacity: 0.7;
      transition: opacity 0.2s;
    }
    .rumdl-error-close:hover {
      opacity: 1;
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(notificationElement);

  // Add close button handler
  const closeButton = notificationElement.querySelector('.rumdl-error-close');
  closeButton?.addEventListener('click', hideErrorNotification);

  // Auto-hide after 10 seconds
  setTimeout(hideErrorNotification, 10000);
}

/**
 * Hide the error notification
 */
export function hideErrorNotification(): void {
  if (notificationElement) {
    notificationElement.remove();
    notificationElement = null;
  }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
