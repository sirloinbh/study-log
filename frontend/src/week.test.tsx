import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { expect, test } from 'vitest';

import { fakeApi } from './test/fake-api';
import { render } from './test/render';
import { Week } from './week';
import { Weeks } from './weeks';

const log = (
  id: number,
  studyDate: string,
  startTime: string,
  endTime: string,
  minutes: number,
) => ({
  id,
  studyDate,
  startTime,
  endTime,
  durationMinutes: minutes,
  memo: '',
  status: 'done',
  textbookId: null,
  textbookTitle: null,
  contentId: null,
  contentNumber: null,
  contentTitle: null,
  understanding: null,
  difficulties: '',
  goalAchieved: null,
  studyType: 'new',
});

test('the Week page lists the seven days with the logs and the time of each', async () => {
  const api = fakeApi({
    'GET /api/study-logs': {
      body: {
        studyLogs: [
          log(2, '2026-11-26', '20:00', '21:00', 60),
          log(1, '2026-11-23', '09:00', '09:30', 30),
        ],
      },
    },
  });
  render(<Week today="2026-11-26" />);
  expect(await screen.findByText('Studied 1 h 30 min this week')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Nov 22 – Nov 28' })).toBeInTheDocument();
  const thursday = screen.getByRole('listitem', { name: 'Thursday 2026-11-26' });
  expect(within(thursday).getByText('1 h')).toBeInTheDocument();
  expect(within(thursday).getByText(/20:00–21:00/)).toBeInTheDocument();
  expect(
    within(screen.getByRole('listitem', { name: 'Friday 2026-11-27' })).getByText('No study'),
  ).toBeInTheDocument();
  expect(
    api.requests.some((request) => request.path.includes('from=2026-11-22&to=2026-11-28')),
  ).toBe(true);
  // There is no week after this one.
  expect(screen.getByRole('button', { name: 'Next week' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Nov 15 – Nov 21' })).toBeInTheDocument(),
  );
});

test('the 12 weeks page shows the time studied in each week, newest first', async () => {
  fakeApi({
    'GET /api/stats/heatmap': {
      body: {
        from: '2026-01-04',
        to: '2026-11-26',
        daily: [
          { date: '2026-11-26', minutes: 60 },
          { date: '2026-11-17', minutes: 120 },
        ],
      },
    },
  });
  render(<Weeks today="2026-11-26" />);
  const items = await screen.findAllByRole('listitem');
  expect(items).toHaveLength(12);
  expect(within(items[0]).getByText('Nov 22 – Nov 28')).toBeInTheDocument();
  expect(within(items[0]).getByText('1 h · 1 day')).toBeInTheDocument();
  expect(within(items[1]).getByText('Nov 15 – Nov 21')).toBeInTheDocument();
  expect(within(items[1]).getByText('2 h · 1 day')).toBeInTheDocument();
  expect(within(items[2]).getByText('No study')).toBeInTheDocument();
});
