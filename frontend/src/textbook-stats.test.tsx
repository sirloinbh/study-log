import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { chapterPercent, type TextbookStats as Stats, textbookStatsPath } from './study-stats';
import { fakeApi } from './test/fake-api';
import { TextbookStats } from './textbook-stats';

// As in screens.test.tsx: the first run after a change is slow.
vi.setConfig({ testTimeout: 20_000 });

const algebra = { id: 7, title: '선형대수', completedChapters: 1, totalChapters: 4 };
const analysis = { id: 8, title: '해석학', completedChapters: 0, totalChapters: 0 };
const schedule = {
  plannedMinutes: 300,
  achievedMinutes: 120,
  achievementRate: 40,
  dueDays: 4,
  onTimeDays: 1,
  adherenceRate: 25,
};
const all: Stats = { textbooks: [algebra, analysis], schedule };
const one: Stats = {
  textbooks: [algebra],
  schedule: { ...schedule, achievementRate: 90, adherenceRate: 75 },
};

const server = () => {
  fakeApi(({ path }) => ({ body: path.endsWith('textbookId=7') ? one : all }));
};
const card = () => within(screen.getByRole('region', { name: 'Textbooks and schedules' }));

test('the path names the book, and a percent of chapters rounds down', () => {
  expect(textbookStatsPath('')).toBe('/api/stats/textbooks');
  expect(textbookStatsPath('7')).toBe('/api/stats/textbooks?textbookId=7');
  expect(chapterPercent({ completedChapters: 1, totalChapters: 3 })).toBe(33);
  expect(chapterPercent({ completedChapters: 2, totalChapters: 3 })).toBe(66);
  expect(chapterPercent({ completedChapters: 0, totalChapters: 0 })).toBe(0);
});

test('chapters per book and how schedules were kept are shown', async () => {
  server();
  render(<TextbookStats />);
  const bar = await card().findByRole('progressbar', { name: '선형대수 completed chapters' });
  expect(bar).toHaveAttribute('aria-valuenow', '25');
  expect(bar.firstElementChild).toHaveStyle({ width: '25%' });
  expect(card().getByText('1 / 4 chapters')).toBeInTheDocument();
  // A book with no contents has nothing to count.
  expect(card().getByText('No contents')).toBeInTheDocument();
  expect(card().queryByRole('progressbar', { name: '해석학 completed chapters' })).toBeNull();
  expect(card().getByText('40%')).toBeInTheDocument();
  expect(card().getByText(/2 h \/ 5 h/)).toBeInTheDocument();
  expect(card().getByText('25%')).toBeInTheDocument();
  expect(card().getByText('1 / 4 days')).toBeInTheDocument();
});

test('picking a book narrows it, and every book stays a choice', async () => {
  server();
  render(<TextbookStats />);
  await card().findByRole('option', { name: '해석학' });
  fireEvent.change(card().getByLabelText('Textbook'), { target: { value: '7' } });
  await card().findByText('90%');
  expect(card().queryByText('No contents')).toBeNull();
  expect(card().getByRole('option', { name: '해석학' })).toBeInTheDocument();
  fireEvent.change(card().getByLabelText('Textbook'), { target: { value: '' } });
  await card().findByText('No contents');
});

test('with nothing due yet the rates say so rather than zero', async () => {
  const none = {
    plannedMinutes: 0,
    achievedMinutes: 0,
    achievementRate: null,
    dueDays: 0,
    onTimeDays: 0,
    adherenceRate: null,
  };
  fakeApi(() => ({ body: { textbooks: [], schedule: none } }));
  render(<TextbookStats />);
  expect(await card().findByText('No schedule has passed its due date yet')).toBeInTheDocument();
  expect(card().getByText('No textbooks registered yet')).toBeInTheDocument();
  expect(card().getAllByText('—')).toHaveLength(2);
  expect(card().queryByText('0%')).toBeNull();
});

test('a failure says so and can be tried again', async () => {
  let failing = true;
  fakeApi(() =>
    failing ? { status: 500, body: { error: 'A server error occurred' } } : { body: all },
  );
  render(<TextbookStats />);
  expect(await card().findByRole('alert')).toHaveTextContent('Could not load the textbook stats');
  failing = false;
  fireEvent.click(card().getByRole('button', { name: 'Reload' }));
  await card().findByText('No contents');
  expect(card().queryByRole('alert')).toBeNull();
  expect(card().getByRole('option', { name: '해석학' })).toBeInTheDocument();
});

test('a slow answer for another pick is not shown', async () => {
  const late: (() => void)[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string) => {
      const reply = (body: unknown) => new Response(JSON.stringify(body));
      if (path.endsWith('textbookId=7'))
        return new Promise<Response>((resolve) => late.push(() => resolve(reply(one))));
      return Promise.resolve(reply(all));
    }),
  );
  render(<TextbookStats />);
  await card().findByText('No contents');
  fireEvent.change(card().getByLabelText('Textbook'), { target: { value: '7' } });
  await waitFor(() => expect(late).toHaveLength(1));
  fireEvent.change(card().getByLabelText('Textbook'), { target: { value: '' } });
  await card().findByText('No contents');
  late.forEach((resolve) => resolve());
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(card().getByText('No contents')).toBeInTheDocument();
  expect(card().queryByText('90%')).toBeNull();
});
