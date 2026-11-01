import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { ButtonSpinner, Loading } from './loading';
import { StudyLogs } from './study-logs';

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
  render(<Loading label="교재를 불러오는 중" />);
  const region = screen.getByRole('group', { name: '교재를 불러오는 중' });
  expect(region.getAttribute('aria-busy')).toBe('true');
  expect(region.querySelector('[data-slot="skeleton-list"]')).toBeTruthy();
  const announced = screen.getByRole('status');
  expect(announced.textContent).toBe('교재를 불러오는 중…');
  expect(region.contains(announced)).toBe(false);
});

test.each([
  ['text', 'skeleton-text', 1],
  ['cards', 'skeleton-card', 4],
] as const)('%s placeholders', (kind, slot, count) => {
  render(<Loading label="통계" kind={kind} />);
  expect(document.querySelectorAll(`[data-slot="${slot}"]`).length).toBe(count);
});

test('a button shows the spinner only while waiting', () => {
  const { rerender } = render(<ButtonSpinner when={false} />);
  expect(screen.queryByRole('status')).toBeNull();
  rerender(<ButtonSpinner when />);
  expect(screen.getByRole('status', { name: '처리하는 중' })).toBeTruthy();
});

// The requests answer when told to, so the waiting state can be looked at.
function heldServer(logs: unknown[]) {
  const release: (() => void)[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: { method?: string }) => {
      const answer = () =>
        new Response(
          init?.method === 'DELETE'
            ? null
            : JSON.stringify(
                url.startsWith('/api/textbooks') ? { textbooks: [] } : { studyLogs: logs },
              ),
          { status: init?.method === 'DELETE' ? 204 : 200 },
        );
      if (init?.method && init.method !== 'GET')
        return new Promise((resolve) => release.push(() => resolve(answer())));
      return Promise.resolve(answer());
    }),
  );
  return release;
}

const spinners = () => document.querySelectorAll('[data-slot="spinner"]');

test('saving spins on the save button only, and stops when done', async () => {
  const release = heldServer([log]);
  render(<StudyLogs today={today} />);
  await screen.findByRole('button', { name: /삭제$/ });
  fireEvent.submit(document.querySelector('form')!);
  const save = document.querySelector<HTMLButtonElement>('form button[type="submit"]')!;
  await waitFor(() => expect(save.disabled).toBe(true));
  expect(spinners().length).toBe(1);
  expect(save.contains(spinners()[0])).toBe(true);
  release[0]();
  await waitFor(() => expect(spinners().length).toBe(0));
});

test('deleting spins on the confirm button, not on save', async () => {
  const release = heldServer([log]);
  render(<StudyLogs today={today} />);
  fireEvent.click(await screen.findByRole('button', { name: /삭제$/ }));
  const confirm = await screen.findByRole('button', { name: /삭제 확인$/ });
  fireEvent.click(confirm);
  await waitFor(() => expect(spinners().length).toBe(1));
  expect(confirm.contains(spinners()[0])).toBe(true);
  expect(within(confirm).getByRole('status', { name: '처리하는 중' })).toBeTruthy();
  release[0]();
  await waitFor(() => expect(spinners().length).toBe(0));
});
