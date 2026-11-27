import './validation-messages';

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';

import { englishMessage } from './validation-messages';

afterEach(() => document.body.replaceChildren());

function Form() {
  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <input aria-label="Title" required minLength={3} />
      <select aria-label="Kind" required defaultValue="">
        <option value="">None</option>
        <option value="a">A</option>
      </select>
      <button type="submit">Save</button>
    </form>
  );
}

test('an empty required field reports an English message, and it clears once the field has a value', () => {
  render(<Form />);
  const title = screen.getByLabelText<HTMLInputElement>('Title');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(title.validationMessage).toBe('Fill in this field');
  fireEvent.input(title, { target: { value: 'Algorithms' } });
  expect(title.validity.customError).toBe(false);
  expect(title.validity.valid).toBe(true);
});

test('a choice, a too-short value and a value filled in by code are all covered', () => {
  render(<Form />);
  const kind = screen.getByLabelText<HTMLSelectElement>('Kind');
  const title = screen.getByLabelText<HTMLInputElement>('Title');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(englishMessage(kind)).toBe('Choose an option');
  // The screen fills the title by code: no input event, yet the next submit must see it as valid.
  title.value = 'Algorithms';
  kind.value = 'a';
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(title.validity.valid).toBe(true);
  expect(kind.validity.valid).toBe(true);
});
