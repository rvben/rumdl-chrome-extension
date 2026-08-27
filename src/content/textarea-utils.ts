/**
 * Update a textarea through its native setter so framework-controlled editors
 * receive the same value change as a user edit.
 */
export function setTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value'
  )?.set;

  if (valueSetter) {
    valueSetter.call(textarea, value);
  } else {
    textarea.value = value;
  }

  textarea.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    composed: true,
    inputType: 'insertReplacementText',
  }));
}

/**
 * Apply a value only if the editor still contains the content the operation
 * was based on. This prevents asynchronous fixes from overwriting newer input.
 */
export function setTextareaValueIfUnchanged(
  textarea: HTMLTextAreaElement,
  expectedValue: string,
  value: string
): boolean {
  if (textarea.value !== expectedValue) {
    return false;
  }

  setTextareaValue(textarea, value);
  return true;
}
