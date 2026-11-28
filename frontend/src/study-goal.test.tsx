import { screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { StudyGoal } from './study-goal';
import { fakeApi } from './test/fake-api';
import { render } from './test/render';

const base = {
  date: '2026-10-20',
  goalMinutes: 120,
  studiedMinutes: 60,
  achievementRate: 50,
  streakDays: 0,
  studiedToday: false,
};

function server(start: Partial<typeof base> = {}) {
  return fakeApi(({ method, path }) =>
    path === '/api/stats/goal' && method === 'GET' ? { body: { ...base, ...start } } : undefined,
  );
}

test('shows today against the fixed 2-hour goal, with the progress bar and no goal form', async () => {
  const api = server();
  render(<StudyGoal />);
  expect(await screen.findByText('1 h of 2 h today')).toBeInTheDocument();
  expect(document.querySelector('[data-goal-rate]')).toHaveTextContent('50%');
  expect(screen.getByRole('progressbar', { name: 'Daily goal progress' })).toHaveAttribute(
    'aria-valuenow',
    '50',
  );
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.queryByRole('spinbutton')).toBeNull();
  expect(api.sent).toEqual([]);
});

test('beyond the goal the bar stops at 100 and the rate keeps counting', async () => {
  server({ studiedMinutes: 300, achievementRate: 250 });
  render(<StudyGoal />);
  expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  expect(document.querySelector('[data-goal-rate]')).toHaveTextContent('250%');
});

test('the streak shows the days, and a hint while today has no study yet', async () => {
  server({ streakDays: 4, studiedToday: false });
  render(<StudyGoal />);
  expect(await screen.findByText('4 days')).toBeInTheDocument();
  expect(screen.getByText(/study today to keep it/)).toBeInTheDocument();
});

test('a failed load is reported', async () => {
  fakeApi(({ path }) =>
    path === '/api/stats/goal' ? { status: 500, body: { error: 'Server error' } } : undefined,
  );
  render(<StudyGoal />);
  expect(await screen.findByText(/Could not load the daily goal: Server error/)).toBeVisible();
});
