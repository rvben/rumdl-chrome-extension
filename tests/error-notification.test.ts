import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetChromeMocks } from './setup';
import {
  showErrorNotification,
  hideErrorNotification,
} from '../src/content/error-notification';

describe('error-notification', () => {
  beforeEach(() => {
    resetChromeMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    hideErrorNotification();
    vi.useRealTimers();
    // Clean up any remaining notification elements
    document.querySelectorAll('.rumdl-error-notification').forEach(el => el.remove());
    // Clean up injected styles
    document.querySelectorAll('style').forEach(el => {
      if (el.textContent?.includes('rumdl-error-notification')) {
        el.remove();
      }
    });
  });

  describe('showErrorNotification', () => {
    it('creates notification element in document body', () => {
      showErrorNotification('Error message');

      const notification = document.querySelector('.rumdl-error-notification');
      expect(notification).toBeTruthy();
      expect(notification?.parentElement).toBe(document.body);
    });

    it('displays message', () => {
      showErrorNotification('WASM module failed to load');

      const notification = document.querySelector('.rumdl-error-notification');
      expect(notification?.textContent).toContain('WASM module failed to load');
    });

    it('displays details when provided', () => {
      showErrorNotification('Error occurred', 'Additional details here');

      const notification = document.querySelector('.rumdl-error-notification');
      expect(notification?.textContent).toContain('Additional details here');
    });

    it('displays rumdl branding', () => {
      showErrorNotification('Error');

      const notification = document.querySelector('.rumdl-error-notification');
      expect(notification?.textContent).toContain('rumdl');
    });

    it('includes close button', () => {
      showErrorNotification('Error');

      const closeBtn = document.querySelector('.rumdl-error-close');
      expect(closeBtn).toBeTruthy();
    });

    it('closes notification when close button clicked', () => {
      showErrorNotification('Error');

      const closeBtn = document.querySelector('.rumdl-error-close') as HTMLElement;
      closeBtn.click();

      const notification = document.querySelector('.rumdl-error-notification');
      expect(notification).toBeNull();
    });

    it('auto-dismisses after 10 seconds', () => {
      showErrorNotification('Error');

      vi.advanceTimersByTime(9999);
      expect(document.querySelector('.rumdl-error-notification')).toBeTruthy();

      vi.advanceTimersByTime(1);
      expect(document.querySelector('.rumdl-error-notification')).toBeNull();
    });

    it('replaces existing notification', () => {
      showErrorNotification('First error');
      showErrorNotification('Second error');

      const notifications = document.querySelectorAll('.rumdl-error-notification');
      expect(notifications.length).toBe(1);
      expect(notifications[0].textContent).toContain('Second error');
    });

    it('sets ARIA role to alert', () => {
      showErrorNotification('Error');

      const notification = document.querySelector('.rumdl-error-notification');
      expect(notification?.getAttribute('role')).toBe('alert');
    });

    it('sets aria-live to assertive', () => {
      showErrorNotification('Error');

      const notification = document.querySelector('.rumdl-error-notification');
      expect(notification?.getAttribute('aria-live')).toBe('assertive');
    });

    it('escapes HTML in message', () => {
      showErrorNotification('<script>alert("xss")</script>');

      const notification = document.querySelector('.rumdl-error-notification');
      expect(notification?.innerHTML).not.toContain('<script>');
      expect(notification?.textContent).toContain('<script>');
    });

    it('escapes HTML in details', () => {
      showErrorNotification('Error', '<img src=x onerror=alert("xss")>');

      const notification = document.querySelector('.rumdl-error-notification');
      expect(notification?.innerHTML).not.toContain('<img src=x');
      expect(notification?.textContent).toContain('<img');
    });

    it('injects styles into document head', () => {
      showErrorNotification('Error');

      const styles = document.querySelectorAll('style');
      const hasErrorStyles = Array.from(styles).some(style =>
        style.textContent?.includes('rumdl-error-notification')
      );
      expect(hasErrorStyles).toBe(true);
    });
  });

  describe('hideErrorNotification', () => {
    it('removes notification from DOM', () => {
      showErrorNotification('Error');
      hideErrorNotification();

      const notification = document.querySelector('.rumdl-error-notification');
      expect(notification).toBeNull();
    });

    it('does nothing if no notification exists', () => {
      // Should not throw
      expect(() => hideErrorNotification()).not.toThrow();
    });

    it('can be called multiple times safely', () => {
      showErrorNotification('Error');
      hideErrorNotification();
      hideErrorNotification();
      hideErrorNotification();

      // Should not throw
      expect(document.querySelector('.rumdl-error-notification')).toBeNull();
    });
  });

  describe('close button accessibility', () => {
    it('has aria-label for screen readers', () => {
      showErrorNotification('Error');

      const closeBtn = document.querySelector('.rumdl-error-close');
      expect(closeBtn?.getAttribute('aria-label')).toBe('Dismiss error');
    });

    it('has title for tooltip', () => {
      showErrorNotification('Error');

      const closeBtn = document.querySelector('.rumdl-error-close');
      expect(closeBtn?.getAttribute('title')).toBe('Dismiss');
    });
  });
});
