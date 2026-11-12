import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { Stats } from './stats';

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
vi.setConfig({ testTimeout: 20_000 });

const books = [
  { id: 7, title: '선형대수', author: '', edition: '' },
  { id: 8, title: '미적분', author: '', edition: '' },
];

// Every log, 300 minutes; 선형대수 90; 미적분 none. Each answer names the minutes in the total.
const studyTime = (url: string) => {
  const minutes = url.includes('textbookId=7') ? 90 : url.includes('textbookId=8') ? 0 : 300;
  return {
    period: 'week',
    from: '2026-10-25',
    to: '2026-10-31',
    totalMinutes: minutes,
    todayMinutes: minutes,
    cumulativeMinutes: minutes,
    days: 7,
    studyDays: minutes ? 1 : 0,
    averageMinutesPerDay: 0,
    averageMinutesPerStudyDay: 0,
    daily: [],
    weekly: [],
    monthly: [],
  };
};

function server(
  answers: { textbooks?: number; studyTime?: (url: string) => Response | undefined } = {},
) {
  const asked: string[] = [];
  const json = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      asked.push(url);
      if (url === '/api/textbooks')
        return answers.textbooks
          ? json({ error: 'Server error' }, answers.textbooks)
          : json({ textbooks: books });
      if (url.startsWith('/api/stats/reviews'))
        return json({
          period: 'week',
          from: '2026-10-25',
          to: '2026-10-31',
          scheduled: 0,
          completed: 0,
          delayed: 0,
          completionRate: null,
        });
      if (url.startsWith('/api/stats/heatmap'))
        return json({ from: '2026-10-25', to: '2026-10-31', daily: [] });
      if (url.startsWith('/api/stats/textbooks'))
        return json({
          textbooks: [],
          schedule: {
            plannedMinutes: 0,
            achievedMinutes: 0,
            achievementRate: null,
            dueDays: 0,
            onTimeDays: 0,
            adherenceRate: null,
          },
        });
      const special = answers.studyTime?.(url);
      return special ? Promise.resolve(special) : json(studyTime(url));
    }),
  );
  return asked;
}

const metrics = () => within(screen.getByRole('region', { name: 'Study time metrics' }));
const totalCard = () =>
  within(metrics().getByRole('heading', { name: 'Total study time' }).closest('article')!);
// The metric cards are taken away while the next answer loads.
const seeTotal = (text: string) =>
  waitFor(() => expect(totalCard().getByText(text)).toBeInTheDocument());
const picker = () => screen.getByRole('combobox', { name: 'Study time textbook' });

test('picking a textbook narrows the study time to its logs, and All brings all back', async () => {
  const asked = server();
  render(<Stats />);
  await seeTotal('5 h');
  await waitFor(() =>
    expect(
      within(picker())
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['All', '선형대수', '미적분']),
  );

  fireEvent.change(picker(), { target: { value: '7' } });
  await seeTotal('1 h 30 min');
  expect(totalCard().getByText('Recorded so far: All · 선형대수')).toBeInTheDocument();
  expect(asked).toContain('/api/stats/study-time?period=week&textbookId=7');

  // With the study type and the period as well.
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Study type' })).getByRole('button', {
      name: 'Review',
    }),
  );
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Period' })).getByRole('button', {
      name: 'This month',
    }),
  );
  await waitFor(() =>
    expect(asked).toContain('/api/stats/study-time?period=month&type=review&textbookId=7'),
  );

  fireEvent.change(picker(), { target: { value: '' } });
  await seeTotal('Recorded so far: Review');
  expect(asked.at(-1)).not.toContain('textbookId');
});

test('a textbook without logs shows zeros, not the last one picked', async () => {
  server();
  render(<Stats />);
  await seeTotal('5 h');
  await waitFor(() => expect(within(picker()).getAllByRole('option')).toHaveLength(3));
  fireEvent.change(picker(), { target: { value: '8' } });
  await seeTotal('Recorded so far: All · 미적분');
  expect(totalCard().getByText('0 min')).toBeInTheDocument();
});

test('the filter is named apart from the one of "Textbooks and schedules"', async () => {
  server();
  render(<Stats />);
  await seeTotal('5 h');
  expect(screen.getAllByRole('combobox', { name: 'Study time textbook' })).toHaveLength(1);
  const cardPicker = within(
    screen.getByRole('region', { name: 'Textbooks and schedules' }),
  ).getByRole('combobox', { name: 'Textbook' });
  expect(screen.getAllByRole('combobox', { name: 'Textbook' })).toEqual([cardPicker]);
});

test('without the textbook list, only every log can be seen, and it says why', async () => {
  server({ textbooks: 500 });
  render(<Stats />);
  await seeTotal('5 h');
  expect(
    await screen.findByText(
      'Could not load the textbook list, so the view cannot be narrowed by textbook',
    ),
  ).toBeInTheDocument();
  expect(within(picker()).getAllByRole('option')).toHaveLength(1);
});

test('a textbook deleted elsewhere is reported, and All still works', async () => {
  server({
    studyTime: (url) =>
      url.includes('textbookId=7')
        ? new Response(JSON.stringify({ error: 'Textbook not found' }), { status: 404 })
        : undefined,
  });
  render(<Stats />);
  await seeTotal('5 h');
  await waitFor(() => expect(within(picker()).getAllByRole('option')).toHaveLength(3));
  fireEvent.change(picker(), { target: { value: '7' } });
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not load the stats: Textbook not found',
  );
  fireEvent.change(picker(), { target: { value: '' } });
  await seeTotal('5 h');
  expect(screen.queryByRole('alert')).toBeNull();
});
