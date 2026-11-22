import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { StudyPattern } from './study-pattern';

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

test('heatmap levels 1 and 2 have different backgrounds', () => {
  // Vitest empties imported CSS, so the stylesheet is read as text (tests run from frontend/).
  const css = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8');
  const background = (level: number) =>
    css.match(new RegExp(`\\.heat-cell\\.level-${level} \\{\\s*background: ([^;]+);`))?.[1];
  expect(background(1)).toBeTruthy();
  expect(background(2)).toBeTruthy();
  expect(background(1)).not.toBe(background(2));
});
