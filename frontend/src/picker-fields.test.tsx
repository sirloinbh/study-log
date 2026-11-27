import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { expect, test } from 'vitest';

import { DateInput, TimeInput } from './picker-fields';

function Form({ onDate }: { onDate?: (value: string) => void }) {
  const [date, setDate] = useState('2026-11-05');
  const [time, setTime] = useState('');
  return (
    <form>
      <DateInput
        text="Study date"
        required
        min="2026-11-03"
        value={date}
        onChange={(event) => {
          setDate(event.target.value);
          onDate?.(event.target.value);
        }}
      />
      <TimeInput text="Start" value={time} onChange={(event) => setTime(event.target.value)} />
    </form>
  );
}

test('the field is named by its text only, and the text focuses the field', () => {
  render(<Form />);
  const field = screen.getByRole('textbox', { name: 'Study date' });
  expect(field).toHaveValue('2026-11-05');
  expect(field).toBeRequired();
  expect(screen.getByText('Study date').closest('label')).toHaveAttribute('for', field.id);
  expect(screen.getByRole('button', { name: 'Pick study date from a calendar' })).toBeVisible();
});

test('typing, picking in the calendar and clearing reach the screen as a plain value', () => {
  const seen: string[] = [];
  render(<Form onDate={(value) => seen.push(value)} />);
  const field = screen.getByRole('textbox', { name: 'Study date' });
  fireEvent.change(field, { target: { value: '2026-11-12' } });
  fireEvent.click(screen.getByRole('button', { name: 'Pick study date from a calendar' }));
  expect(screen.getByRole('button', { name: 'November 2, 2026' })).toBeDisabled(); // before min
  fireEvent.click(screen.getByRole('button', { name: 'November 20, 2026' }));
  expect(field).toHaveValue('2026-11-20');
  fireEvent.change(field, { target: { value: '' } });
  expect(seen).toEqual(['2026-11-12', '2026-11-20', '']);
});

test('the time field picks an hour and a minute', () => {
  render(<Form />);
  fireEvent.click(screen.getByRole('button', { name: 'Pick start from a list' }));
  fireEvent.click(screen.getByRole('button', { name: 'Hour 9' }));
  fireEvent.click(screen.getByRole('button', { name: 'Minute 30' }));
  expect(screen.getByRole('textbox', { name: 'Start' })).toHaveValue('09:30');
});

test('no native date or time input is left on a screen (they show the browser language)', () => {
  const { container } = render(<Form />);
  expect(container.querySelector('input[type="date"], input[type="time"]')).toBeNull();
});
