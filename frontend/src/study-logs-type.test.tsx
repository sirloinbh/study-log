import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { StudyLogs } from './StudyLogs';

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
  studyType: 'review',
};

function server(logs: unknown[]) {
  const sent: { method?: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: { method?: string; body?: string }) => {
      if (init?.method && init.method !== 'GET') {
        sent.push({ method: init.method, body: JSON.parse(init.body ?? '{}') });
        return Promise.resolve(new Response(JSON.stringify({ studyLog: log })));
      }
      return Promise.resolve(
        new Response(
          JSON.stringify(
            url.startsWith('/api/textbooks') ? { textbooks: [] } : { studyLogs: logs },
          ),
        ),
      );
    }),
  );
  return sent;
}

const submit = () => fireEvent.submit(document.querySelector('form')!);

test('a new log is new unless review is picked', async () => {
  const sent = server([]);
  render(<StudyLogs today={today} />);
  const type = screen.getByLabelText<HTMLSelectElement>('유형');
  expect(type.value).toBe('new');
  fireEvent.change(type, { target: { value: 'review' } });
  fireEvent.change(screen.getByLabelText('시작'), { target: { value: '09:00' } });
  fireEvent.change(screen.getByLabelText('종료'), { target: { value: '10:00' } });
  submit();
  await waitFor(() => expect(sent.length).toBe(1));
  expect(sent[0].body.studyType).toBe('review');
  // The form returns to the default for the next entry.
  await waitFor(() => expect(screen.getByLabelText<HTMLSelectElement>('유형').value).toBe('new'));
});

test('a review log is marked in the list and keeps its type when edited', async () => {
  const sent = server([log]);
  render(<StudyLogs today={today} />);
  const editButton = await screen.findByRole('button', { name: /수정$/ });
  const item = editButton.closest('li')!;
  expect(within(item).getByText('복습')).toBeTruthy();
  fireEvent.click(editButton);
  expect(screen.getByLabelText<HTMLSelectElement>('유형').value).toBe('review');
  submit();
  await waitFor(() => expect(sent.length).toBe(1));
  expect(sent[0]).toMatchObject({ method: 'PUT', body: { studyType: 'review' } });
});

test('a new log has no mark', async () => {
  server([{ ...log, studyType: 'new' }]);
  render(<StudyLogs today={today} />);
  const editButton = await screen.findByRole('button', { name: /수정$/ });
  expect(within(editButton.closest('li')!).queryByText('복습')).toBeNull();
});
