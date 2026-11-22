import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { Retrospectives } from './retrospectives';
import { StudyLogSearch } from './study-log-search';
import type { StudyLog } from './study-logs-data';

vi.setConfig({ testTimeout: 60_000 });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const log = (id: number, memo: string): StudyLog => ({
  id,
  studyDate: '2026-10-20',
  startTime: '09:00',
  endTime: '10:00',
  durationMinutes: 60,
  memo,
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

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

test('an older search answer never replaces the latest results', async () => {
  const slow: ((value: Response) => void)[] = [];
  let calls = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      calls += 1;
      // The first search is answered at once; the reload after it is slow; the third is quick.
      if (calls === 2) return new Promise<Response>((resolve) => slow.push(resolve));
      return Promise.resolve(
        json({ studyLogs: [log(calls, calls === 1 ? 'old memo' : 'new memo')] }),
      );
    }),
  );
  const { rerender } = render(<StudyLogSearch textbooks={[]} reloadKey={0} />);
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  expect(await screen.findByText('old memo')).toBeTruthy();
  // Logs changed elsewhere: the shown search runs again, slowly.
  rerender(<StudyLogSearch textbooks={[]} reloadKey={1} />);
  await waitFor(() => expect(slow).toHaveLength(1));
  // A new search is made and answered before the slow one.
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  expect(await screen.findByText('new memo')).toBeTruthy();
  slow[0](json({ studyLogs: [log(9, 'stale memo')] }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(screen.queryByText('stale memo')).toBeNull();
  expect(screen.getByText('new memo')).toBeTruthy();
});

test('a failing recent list shows an error and a retry, not "No retrospectives yet"', async () => {
  let listFails = true;
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string) => {
      if (path.startsWith('/api/retrospectives?'))
        return Promise.resolve(
          listFails ? json({ error: 'Server error' }, 500) : json({ retrospectives: [] }),
        );
      if (path.startsWith('/api/retrospectives/period'))
        return Promise.resolve(
          json({
            kind: 'weekly',
            from: '2026-10-18',
            to: '2026-10-24',
            retrospective: null,
            summary: { totalMinutes: 0, studyDays: 0, logs: 0, goalsAchieved: 0, goalsChecked: 0 },
          }),
        );
      return Promise.resolve(json({ topHour: null, topWeekday: null, byHour: [], byWeekday: [] }));
    }),
  );
  render(<Retrospectives today="2026-10-23" />);
  expect(await screen.findByText(/Could not load the past retrospectives/)).toBeTruthy();
  expect(screen.queryByText('No retrospectives yet')).toBeNull();
  listFails = false;
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading the past retrospectives' }));
  expect(await screen.findByText('No retrospectives yet')).toBeTruthy();
});
