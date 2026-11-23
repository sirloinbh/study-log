import { screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { StudyPattern } from './study-pattern';
import { heatCellStyle } from './study-stats';
import { render } from './test/render';

test('the hour values can be found by accessible text', async () => {
  const byHour = Array.from({ length: 24 }, (_, hour) => (hour === 9 ? 90 : 0));
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ topHour: 9, topWeekday: 1, byHour, byWeekday: [0, 90, 0, 0, 0, 0, 0] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    ),
  );
  render(<StudyPattern from="2026-10-25" to="2026-10-31" />);
  const list = await screen.findByRole('list', { name: 'Study time by hour' });
  await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(24));
  expect(within(list).getByText('09:00–10:00: 1 h 30 min')).toBeTruthy();
  expect(within(list).getAllByText(/no study/)).toHaveLength(23);
});

test('every heatmap level has its own look, and the two tints differ', () => {
  const levels = ['0', '1', '2', '3', '4', 'future'];
  expect(new Set(levels.map((level) => heatCellStyle[level])).size).toBe(levels.length);
});
