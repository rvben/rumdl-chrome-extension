import { describe, expect, it, vi } from 'vitest';
import {
  setTextareaValue,
  setTextareaValueIfUnchanged,
} from '../src/content/textarea-utils';

describe('textarea value updates', () => {
  it('uses the native setter and dispatches a composed input event', () => {
    const textarea = document.createElement('textarea');
    const listener = vi.fn();
    textarea.addEventListener('input', listener);

    setTextareaValue(textarea, 'fixed markdown');

    expect(textarea.value).toBe('fixed markdown');
    expect(listener).toHaveBeenCalledOnce();
    const event = listener.mock.calls[0][0] as InputEvent;
    expect(event.bubbles).toBe(true);
    expect(event.composed).toBe(true);
    expect(event.inputType).toBe('insertReplacementText');
  });

  it('does not overwrite content that changed during an async operation', () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'newer input';

    const applied = setTextareaValueIfUnchanged(
      textarea,
      'older input',
      'fixed older input'
    );

    expect(applied).toBe(false);
    expect(textarea.value).toBe('newer input');
  });
});
