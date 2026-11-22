import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test } from 'vitest';

import { ButtonSpinner, Loading } from './loading';
import { StudyLogs } from './study-logs';
import { fakeApi } from './test/fake-api';

const today = '2026-10-31';
const log = {
  id: 1,
  studyDate: today,
  startTime: '09:00',
  endTime: '10:00',
  durationMinutes: 60,
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
};

test('a loading part is busy, named and announced from outside the busy region', () => {
  render(<Loading label="Loading the textbooks" />);
  const region = screen.getByRole('group', { name: 'Loading the textbooks' });
  expect(region.getAttribute('aria-busy')).toBe('true');
  expect(region.querySelector('[data-slot="skeleton-list"]')).toBeTruthy();
  const announced = screen.getByRole('status');
  expect(announced.textContent).toBe('Loading the textbooks…');
  expect(region.contains(announced)).toBe(false);
});

test.each([
  ['text', 'skeleton-text', 1],
  ['cards', 'skeleton-card', 4],
] as const)('%s placeholders', (kind, slot, count) => {
  render(<Loading label="Stats" kind={kind} />);
  expect(document.querySelectorAll(`[data-slot="${slot}"]`).length).toBe(count);
});

test('a button shows the spinner only while waiting', () => {
  const { rerender } = render(<ButtonSpinner when={false} />);
  expect(screen.queryByRole('status')).toBeNull();
  rerender(<ButtonSpinner when />);
  expect(screen.getByRole('status', { name: 'Working' })).toBeTruthy();
});

// The writes answer when told to, so the waiting state can be looked at.
function heldServer(logs: unknown[]) {
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  fakeApi({
    'GET /api/textbooks': { body: { textbooks: [] } },
    'GET /api/study-logs': { body: { studyLogs: logs } },
    'GET /api/study-logs/calendar': {
      body: { month: today.slice(0, 7), days: [{ date: today, minutes: 60, logs: 1 }] },
    },
    'POST /api/study-logs': { hold: held, status: 201, body: { studyLog: log } },
    'DELETE /api/study-logs/1': { hold: held, status: 204 },
  });
  return release;
}

const spinners = () => document.querySelectorAll('[data-slot="spinner"]');

test('saving spins on the save button only, and stops when done', async () => {
  const release = heldServer([log]);
  render(<StudyLogs today={today} />);
  await screen.findByRole('button', { name: /delete$/ });
  fireEvent.submit(document.querySelector('form')!);
  const save = document.querySelector<HTMLButtonElement>('form button[type="submit"]')!;
  await waitFor(() => expect(save.disabled).toBe(true));
  expect(spinners().length).toBe(1);
  expect(save.contains(spinners()[0])).toBe(true);
  release();
  await waitFor(() => expect(spinners().length).toBe(0));
});

test('deleting spins on the confirm button, not on save', async () => {
  const release = heldServer([log]);
  render(<StudyLogs today={today} />);
  fireEvent.click(await screen.findByRole('button', { name: /delete$/ }));
  const confirm = await screen.findByRole('button', { name: /confirm deletion$/ });
  fireEvent.click(confirm);
  await waitFor(() => expect(spinners().length).toBe(1));
  expect(confirm.contains(spinners()[0])).toBe(true);
  expect(within(confirm).getByRole('status', { name: 'Working' })).toBeTruthy();
  release();
  await waitFor(() => expect(spinners().length).toBe(0));
});
