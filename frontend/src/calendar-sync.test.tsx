import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { CalendarSync } from './calendar-sync';
import { fakeApi } from './test/fake-api';
import { render } from './test/render';

const base = {
  configured: true,
  connected: false,
  calendarName: 'Study log',
  lastSyncedAt: null,
  lastError: null,
  events: 0,
};

test('not set up on the server: says so and offers no button', async () => {
  fakeApi({ 'GET /api/calendar-sync/status': { body: { ...base, configured: false } } });
  render(<CalendarSync />);
  expect(await screen.findByText('Not set up on the server yet.')).toBeInTheDocument();
  expect(screen.queryByRole('button')).toBeNull();
});

test('connecting asks the server for the sign-in address and opens it', async () => {
  const go = vi.fn();
  const api = fakeApi({
    'GET /api/calendar-sync/status': { body: base },
    'POST /api/calendar-sync/connect': { body: { url: 'https://accounts.example/auth?x=1' } },
  });
  render(<CalendarSync go={go} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Connect Google Calendar' }));
  await waitFor(() => expect(go).toHaveBeenCalledWith('https://accounts.example/auth?x=1'));
  expect(api.sent).toEqual([{ method: 'POST', path: '/api/calendar-sync/connect' }]);
});

test('a failed connect request shows the server message', async () => {
  fakeApi({
    'GET /api/calendar-sync/status': { body: base },
    'POST /api/calendar-sync/connect': {
      status: 503,
      body: { error: 'Google sync is not set up' },
    },
  });
  render(<CalendarSync go={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Connect Google Calendar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Google sync is not set up');
});

test('when connected it shows the state, syncs on request and reports the counts', async () => {
  const api = fakeApi({
    'GET /api/calendar-sync/status': {
      body: { ...base, connected: true, events: 1, lastSyncedAt: '2026-11-24T01:00:00Z' },
    },
    'POST /api/calendar-sync/sync': { body: { created: 2, updated: 1, removed: 0 } },
  });
  render(<CalendarSync />);
  expect(await screen.findByText(/1 event on it/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
  expect(await screen.findByText('Synced: 2 added, 1 moved, 0 removed')).toBeInTheDocument();
  expect(api.sent).toEqual([{ method: 'POST', path: '/api/calendar-sync/sync' }]);
});

test('the last failure is shown as an alert', async () => {
  fakeApi({
    'GET /api/calendar-sync/status': {
      body: {
        ...base,
        connected: true,
        lastError: 'Google refused the saved sign-in. Connect again',
      },
    },
  });
  render(<CalendarSync />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Connect again');
});

test('disconnecting asks first, then removes the connection', async () => {
  let connected = true;
  const api = fakeApi({
    'GET /api/calendar-sync/status': () => ({ body: { ...base, connected } }),
    'DELETE /api/calendar-sync': () => {
      connected = false;
      return { status: 204 };
    },
  });
  render(<CalendarSync />);
  fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));
  const dialog = await screen.findByRole('dialog');
  expect(api.sent).toEqual([]);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Disconnect' }));
  expect(
    await screen.findByRole('button', { name: 'Connect Google Calendar' }),
  ).toBeInTheDocument();
  expect(api.sent).toEqual([{ method: 'DELETE', path: '/api/calendar-sync' }]);
});

test('the page after Google sign-in reports how it went', async () => {
  fakeApi({ 'GET /api/calendar-sync/status': { body: { ...base, connected: true } } });
  render(<CalendarSync search="?calendar=connected" />);
  expect(await screen.findByText(/^Connected\. Your schedule/)).toBeInTheDocument();
});
