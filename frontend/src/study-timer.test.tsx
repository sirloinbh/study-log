import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { StudyTimer } from './study-timer';
import { fakeApi } from './test/fake-api';
import { render } from './test/render';

type Timer = { startedAt: string; paused: boolean; elapsedSeconds: number } | null;

// A small server that holds one timer, as the real one does.
function server(start: Timer = null, stopAnswer?: { status: number; body: unknown }) {
  let timer = start;
  return fakeApi(({ method, path }) => {
    if (path !== '/api/study-timer' && !path.startsWith('/api/study-timer/')) return undefined;
    if (method === 'GET') return { body: { timer } };
    if (method === 'DELETE') {
      timer = null;
      return { status: 204 };
    }
    const action = path.split('/').pop();
    if (action === 'start') {
      timer = { startedAt: '2026-10-22T00:00:00Z', paused: false, elapsedSeconds: 0 };
      return { status: 201, body: { timer } };
    }
    if (action === 'pause') timer = { ...timer!, paused: true };
    if (action === 'resume') timer = { ...timer!, paused: false };
    if (action === 'stop') {
      if (stopAnswer) return stopAnswer;
      timer = null;
      return { status: 201, body: { studyLogId: 5, studyDate: '2026-10-22', minutes: 25 } };
    }
    return { body: { timer } };
  });
}

const button = (name: string) => screen.findByRole('button', { name });

test('with no timer running it offers to start one, and the timer then shows its time', async () => {
  const api = server();
  render(<StudyTimer />);
  fireEvent.click(await button('Start the timer'));
  expect(await screen.findByRole('timer')).toHaveTextContent('0:00:0');
  expect(api.sent).toEqual([{ method: 'POST', path: '/api/study-timer/start' }]);
  expect(await button('Pause')).toBeEnabled();
});

test('a running timer shows the time the server counted, so a reload shows the same', async () => {
  server({ startedAt: '2026-10-22T00:00:00Z', paused: false, elapsedSeconds: 3725 });
  render(<StudyTimer />);
  expect(await screen.findByRole('timer')).toHaveTextContent(/^1:02:0[5-9]/);
});

test('pausing freezes the time and shows Resume; resuming brings Pause back', async () => {
  const api = server({ startedAt: '2026-10-22T00:00:00Z', paused: false, elapsedSeconds: 600 });
  render(<StudyTimer />);
  fireEvent.click(await button('Pause'));
  expect(await button('Resume')).toBeEnabled();
  expect(screen.getByRole('timer')).toHaveTextContent('0:10:00');
  expect(screen.getByRole('timer')).toHaveTextContent('Paused');
  fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
  await button('Pause');
  expect(api.sent.map((request) => request.path)).toEqual([
    '/api/study-timer/pause',
    '/api/study-timer/resume',
  ]);
});

test('stopping saves a study log, says how long, and tells the screen', async () => {
  server({ startedAt: '2026-10-22T00:00:00Z', paused: false, elapsedSeconds: 1500 });
  const stopped = vi.fn();
  render(<StudyTimer onStopped={stopped} />);
  fireEvent.click(await button('Stop and save'));
  expect(await screen.findByText('Saved a study log of 25 min')).toBeInTheDocument();
  expect(stopped).toHaveBeenCalledTimes(1);
  expect(await button('Start the timer')).toBeEnabled();
});

test('a refused stop (under a minute) is shown and the timer keeps running', async () => {
  server(
    { startedAt: '2026-10-22T00:00:00Z', paused: false, elapsedSeconds: 20 },
    {
      status: 400,
      body: { error: 'The session is under a minute. Keep studying, or cancel the timer' },
    },
  );
  const stopped = vi.fn();
  render(<StudyTimer onStopped={stopped} />);
  fireEvent.click(await button('Stop and save'));
  expect(await screen.findByRole('alert')).toHaveTextContent(/under a minute/);
  expect(stopped).not.toHaveBeenCalled();
  expect(screen.getByRole('timer')).toBeInTheDocument();
});

test('discarding asks first, then removes the timer without a study log', async () => {
  const api = server({ startedAt: '2026-10-22T00:00:00Z', paused: false, elapsedSeconds: 300 });
  render(<StudyTimer />);
  fireEvent.click(await button('Discard timer'));
  const dialog = await screen.findByRole('dialog');
  expect(api.sent).toEqual([]);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Discard' }));
  await waitFor(() => expect(api.sent).toEqual([{ method: 'DELETE', path: '/api/study-timer' }]));
  expect(await button('Start the timer')).toBeEnabled();
  expect(await screen.findByText('Discarded the timer')).toBeInTheDocument();
});

test('a failed load is reported instead of offering to start', async () => {
  fakeApi(({ path }) =>
    path === '/api/study-timer' ? { status: 500, body: { error: 'Server error' } } : undefined,
  );
  render(<StudyTimer />);
  expect(await screen.findByText(/Could not load the timer: Server error/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Start the timer' })).toBeNull();
});
