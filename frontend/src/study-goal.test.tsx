import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, test } from 'vitest';

import { StudyGoal } from './study-goal';
import { fakeApi } from './test/fake-api';
import { render } from './test/render';

const base = {
  weekStart: '2026-10-18',
  weekEnd: '2026-10-24',
  goalMinutes: null as number | null,
  goalSince: null as string | null,
  studiedMinutes: 300,
  achievementRate: null as number | null,
  streakDays: 0,
  studiedToday: false,
};

// One goal held by a small server, answered with the rate the real one would compute.
function server(start: Partial<typeof base> = {}, failSave?: string) {
  let goal = { ...base, ...start };
  return fakeApi(({ method, path, body }) => {
    if (path !== '/api/stats/goal') return undefined;
    if (method === 'PUT') {
      if (failSave) return { status: 400, body: { error: failSave } };
      const minutes = (body as { minutes: number }).minutes;
      goal = {
        ...goal,
        goalMinutes: minutes,
        achievementRate: Math.round((goal.studiedMinutes * 100) / minutes),
      };
      return { body: { weekStart: goal.weekStart, goalMinutes: minutes } };
    }
    return { body: goal };
  });
}

test('with no goal it says so and offers to set one', async () => {
  server();
  render(<StudyGoal />);
  expect(await screen.findByText(/No goal yet/)).toBeInTheDocument();
  expect(screen.getByText('2026-10-18 ~ 2026-10-24')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Set goal' })).toBeDisabled();
});

test('setting 10 hours with 5 hours studied shows 50% and the progress bar', async () => {
  const api = server();
  render(<StudyGoal />);
  fireEvent.change(await screen.findByLabelText('Goal for this week (hours)'), {
    target: { value: '10' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Set goal' }));
  expect(await screen.findByText('Saved the weekly goal')).toBeInTheDocument();
  expect(api.sent).toEqual([{ method: 'PUT', path: '/api/stats/goal', body: { minutes: 600 } }]);
  await waitFor(() => expect(document.querySelector('[data-goal-rate]')).toHaveTextContent('50%'));
  expect(screen.getByText('5 h of 10 h this week')).toBeInTheDocument();
  expect(screen.getByRole('progressbar', { name: 'Weekly goal progress' })).toHaveAttribute(
    'aria-valuenow',
    '50',
  );
  expect(screen.getByRole('button', { name: 'Change goal' })).toBeInTheDocument();
});

test('beyond the goal the bar stops at 100 and the rate keeps counting', async () => {
  server({ goalMinutes: 120, goalSince: '2026-10-18', achievementRate: 250 });
  render(<StudyGoal />);
  expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  expect(document.querySelector('[data-goal-rate]')).toHaveTextContent('250%');
  expect(screen.getByLabelText('Goal for this week (hours)')).toHaveValue(2);
});

test('the streak shows the days, and a hint while today has no study yet', async () => {
  server({ streakDays: 4, studiedToday: false });
  render(<StudyGoal />);
  expect(await screen.findByText('4 days')).toBeInTheDocument();
  expect(screen.getByText(/study today to keep it/)).toBeInTheDocument();
});

test('a goal of zero or beyond a week cannot be sent', async () => {
  const api = server();
  render(<StudyGoal />);
  const input = await screen.findByLabelText('Goal for this week (hours)');
  for (const value of ['0', '169', '']) {
    fireEvent.change(input, { target: { value } });
    expect(screen.getByRole('button', { name: 'Set goal' })).toBeDisabled();
  }
  expect(api.sent).toEqual([]);
});

test('a refused save is shown and the typed goal stays', async () => {
  server({}, 'The goal must be at least 1 minute');
  render(<StudyGoal />);
  const input = await screen.findByLabelText('Goal for this week (hours)');
  fireEvent.change(input, { target: { value: '5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Set goal' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('The goal must be at least 1 minute');
  expect(input).toHaveValue(5);
});

test('a failed load is reported', async () => {
  fakeApi(({ path }) =>
    path === '/api/stats/goal' ? { status: 500, body: { error: 'Server error' } } : undefined,
  );
  render(<StudyGoal />);
  expect(await screen.findByText(/Could not load the weekly goal: Server error/)).toBeVisible();
});
