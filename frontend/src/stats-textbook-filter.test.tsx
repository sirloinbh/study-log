import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { Stats } from './stats';
import { type Answer, fakeApi } from './test/fake-api';
import { finishedDays, finishedStats } from './test/finished';
import { render } from './test/render';

// As in stats-review.test.tsx: the chart library draws nothing here, and the page is slow to query.
vi.mock('recharts', () => {
  const Part = () => null;
  return {
    ResponsiveContainer: Part,
    BarChart: Part,
    CartesianGrid: Part,
    XAxis: Part,
    YAxis: Part,
    Tooltip: Part,
    Bar: Part,
  };
});

const books = [
  { id: 7, title: '선형대수', author: '', edition: '' },
  { id: 8, title: '미적분', author: '', edition: '' },
];

// Every textbook, 5 chapters finished; 선형대수 2; 미적분 none. Each answer names the chapters.
const finished = (url: string) => {
  const chapters = url.includes('textbookId=7') ? 2 : url.includes('textbookId=8') ? 0 : 5;
  return finishedStats({
    chapters,
    todayChapters: chapters,
    cumulativeChapters: chapters,
    totalChapters: 10,
  });
};

function server(
  answers: { textbooks?: number; finished?: (path: string) => Answer | undefined } = {},
) {
  return fakeApi({
    'GET /api/textbooks': answers.textbooks
      ? { status: answers.textbooks, body: { error: 'Server error' } }
      : { body: { textbooks: books } },
    'GET /api/stats/reviews': {
      body: {
        period: 'week',
        from: '2026-10-25',
        to: '2026-10-31',
        scheduled: 0,
        completed: 0,
        delayed: 0,
        completionRate: null,
      },
    },
    'GET /api/stats/finished-days': { body: finishedDays() },
    'GET /api/stats/textbooks': {
      body: {
        textbooks: [],
        schedule: {
          plannedMinutes: 0,
          achievedMinutes: 0,
          achievementRate: null,
          dueDays: 0,
          onTimeDays: 0,
          adherenceRate: null,
        },
      },
    },
    'GET /api/stats/finished-contents': ({ path }) =>
      answers.finished?.(path) ?? { body: finished(path) },
  });
}

const metrics = () => within(screen.getByRole('region', { name: 'Finished metrics' }));
const totalCard = () =>
  within(metrics().getByRole('heading', { name: 'Finished so far' }).closest('article')!);
// The metric cards are taken away while the next answer loads.
const seeTotal = (text: string) =>
  waitFor(() => expect(totalCard().getByText(text)).toBeInTheDocument());
const picker = () => screen.getByRole('combobox', { name: 'Finished counts textbook' });

test('picking a textbook narrows the finished counts to it, and All brings all back', async () => {
  const api = server();
  render(<Stats />);
  await seeTotal('5 chapters');
  await waitFor(() =>
    expect(
      within(picker())
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['All', '선형대수', '미적분']),
  );

  fireEvent.change(picker(), { target: { value: '7' } });
  await seeTotal('2 chapters');
  expect(totalCard().getByText('Of 10 chapters and 6 sections · 선형대수')).toBeInTheDocument();
  expect(api.requests.map((r) => r.path)).toContain(
    '/api/stats/finished-contents?period=week&textbookId=7',
  );

  // With the period as well.
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Period' })).getByRole('button', {
      name: 'This month',
    }),
  );
  await api.requested((r) => r.path === '/api/stats/finished-contents?period=month&textbookId=7');

  fireEvent.change(picker(), { target: { value: '' } });
  await seeTotal('5 chapters');
  expect(api.requests.at(-1)?.path).not.toContain('textbookId');
});

test('a textbook without logs shows zeros, not the last one picked', async () => {
  server();
  render(<Stats />);
  await seeTotal('5 chapters');
  await waitFor(() => expect(within(picker()).getAllByRole('option')).toHaveLength(3));
  fireEvent.change(picker(), { target: { value: '8' } });
  await seeTotal('0 chapters');
  expect(totalCard().getByText('Of 10 chapters and 6 sections · 미적분')).toBeInTheDocument();
});

test('the filter is named apart from the one of "Textbooks and schedules"', async () => {
  server();
  render(<Stats />);
  await seeTotal('5 chapters');
  expect(screen.getAllByRole('combobox', { name: 'Finished counts textbook' })).toHaveLength(1);
  const cardPicker = within(
    screen.getByRole('region', { name: 'Textbooks and schedules' }),
  ).getByRole('combobox', { name: 'Textbook' });
  expect(screen.getAllByRole('combobox', { name: 'Textbook' })).toEqual([cardPicker]);
});

test('without the textbook list, only every log can be seen, and it says why', async () => {
  server({ textbooks: 500 });
  render(<Stats />);
  await seeTotal('5 chapters');
  expect(
    await screen.findByText(
      'Could not load the textbook list, so the view cannot be narrowed by textbook',
    ),
  ).toBeInTheDocument();
  expect(within(picker()).getAllByRole('option')).toHaveLength(1);
});

test('a textbook deleted elsewhere is reported, and All still works', async () => {
  server({
    finished: (path) =>
      path.includes('textbookId=7')
        ? { status: 404, body: { error: 'Textbook not found' } }
        : undefined,
  });
  render(<Stats />);
  await seeTotal('5 chapters');
  await waitFor(() => expect(within(picker()).getAllByRole('option')).toHaveLength(3));
  fireEvent.change(picker(), { target: { value: '7' } });
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not load the stats: Textbook not found',
  );
  fireEvent.change(picker(), { target: { value: '' } });
  await seeTotal('5 chapters');
  expect(screen.queryByRole('alert')).toBeNull();
});
