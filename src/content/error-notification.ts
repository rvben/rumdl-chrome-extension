// Error notification component for displaying user-visible errors

import { escapeHtml } from '../shared/html-utils.js';

let notificationElement: HTMLElement | null = null;
let dismissTimer: ReturnType<typeof setTimeout> | null = null;

function ensureNotificationStyles(): void {
  if (document.getElementById('rumdl-error-notification-styles')) return;

  const style = document.createElement('style');
  style.id = 'rumdl-error-notification-styles';
  style.textContent = `
    .rumdl-error-notification {
      --rumdl-error-bg: #cf222e;
      --rumdl-error-fg: #ffffff;
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 999999;
      box-sizing: border-box;
      width: max-content;
      max-width: min(400px, calc(100vw - 32px));
      color: var(--rumdl-error-fg);
      background: var(--rumdl-error-bg);
      border: 1px solid rgba(255, 255, 255, 0.28);
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(31, 35, 40, 0.28);
      animation: rumdl-notification-in 180ms cubic-bezier(0.16, 1, 0.3, 1);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
    }
    @keyframes rumdl-notification-in {
      from { transform: translateY(-6px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .rumdl-error-content {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px 14px;
    }
    .rumdl-error-content > svg { flex-shrink: 0; margin-top: 2px; }
    .rumdl-error-text { flex: 1; min-width: 0; line-height: 1.4; overflow-wrap: anywhere; }
    .rumdl-error-details { margin-top: 4px; font-size: 12px; opacity: 0.9; }
    .rumdl-error-close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      margin: -6px -8px 0 0;
      padding: 0;
      color: var(--rumdl-error-fg);
      background: transparent;
      border: 0;
      border-radius: 6px;
      cursor: pointer;
      opacity: 0.8;
      transition: background-color 100ms ease, opacity 100ms ease;
    }
    .rumdl-error-close:hover { background: rgba(255, 255, 255, 0.15); opacity: 1; }
    .rumdl-error-close:focus-visible { outline: 2px solid #ffffff; outline-offset: 1px; opacity: 1; }
    @media (prefers-reduced-motion: reduce) {
      .rumdl-error-notification { animation: none; }
      .rumdl-error-close { transition-duration: 0.01ms; }
    }
  `;
  document.head.appendChild(style);
}

/**
 * Show an error notification to the user
 */
export function showErrorNotification(message: string, details?: string): void {
  // Remove existing notification if any
  hideErrorNotification();
  ensureNotificationStyles();

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
      <button type="button" class="rumdl-error-close" aria-label="Dismiss error" title="Dismiss">
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
          <path d="M3 3l10 10M13 3L3 13"/>
        </svg>
      </button>
    </div>
  `;
  document.body.appendChild(notificationElement);

  // Add close button handler
  const closeButton = notificationElement.querySelector('.rumdl-error-close');
  closeButton?.addEventListener('click', hideErrorNotification);

  // Auto-hide after 10 seconds
  dismissTimer = setTimeout(hideErrorNotification, 10000);
}

/**
 * Hide the error notification
 */
export function hideErrorNotification(): void {
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
  if (notificationElement) {
    notificationElement.remove();
    notificationElement = null;
  }
}
