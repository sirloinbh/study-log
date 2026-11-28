import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { expect, test } from 'vitest';

import { fakeApi } from './test/fake-api';
import { render } from './test/render';
import { StudyLogScreen } from './test/study-log-screen';

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
  finishedContentIds: [],
  understanding: null,
  goalAchieved: null,
  studyType: 'review',
};

function server(logs: unknown[]) {
  return fakeApi({
    'GET /api/textbooks': { body: { textbooks: [] } },
    'GET /api/study-logs': { body: { studyLogs: logs } },
    'GET /api/study-logs/calendar': {
      body: { month: today.slice(0, 7), days: [{ date: today, minutes: 60, logs: 1 }] },
    },
    'POST /api/study-logs': { status: 201, body: { studyLog: log } },
    'GET /api/study-logs/1': { body: { studyLog: logs[0] } },
    'PUT /api/study-logs/1': { body: { studyLog: log } },
  });
}

const submit = () => fireEvent.submit(document.querySelector('form')!);

test('a new log is new unless review is picked', async () => {
  const api = server([]);
  render(<StudyLogScreen today={today} />);
  const type = screen.getByLabelText<HTMLSelectElement>('Type');
  expect(type.value).toBe('new');
  fireEvent.change(type, { target: { value: 'review' } });
  fireEvent.change(screen.getByLabelText('Start'), { target: { value: '09:00' } });
  fireEvent.change(screen.getByLabelText('End'), { target: { value: '10:00' } });
  submit();
  const request = await api.requested((r) => r.method === 'POST');
  expect(request.body).toMatchObject({ studyType: 'review' });
  // The form returns to the default for the next entry.
  await waitFor(() => expect(screen.getByLabelText<HTMLSelectElement>('Type').value).toBe('new'));
});

test('a review log is marked in the list and keeps its type when edited', async () => {
  const api = server([log]);
  render(<StudyLogScreen today={today} />);
  const editButton = await screen.findByRole('button', { name: /Edit log/ });
  const item = editButton.closest('li')!;
  expect(within(item).getByText('Review')).toBeTruthy();
  fireEvent.click(editButton);
  await waitFor(() =>
    expect(screen.getByLabelText<HTMLSelectElement>('Type').value).toBe('review'),
  );
  submit();
  const request = await api.requested((r) => r.method === 'PUT');
  expect(request).toMatchObject({ path: '/api/study-logs/1', body: { studyType: 'review' } });
});

test('search results and the calendar mark a review log too', async () => {
  server([log]);
  render(<StudyLogScreen today={today} />);
  // The log's row in each place it is listed: the recent list, the calendar's day and the search.
  const row = (place: HTMLElement) => within(place).getByText('09:00–10:00').closest('li')!;
  const recent = document.getElementById('study-log-list')!.closest('section')!;
  await within(recent).findByText('09:00–10:00');
  expect(within(row(recent)).getByText('Review')).toBeTruthy();
  const calendar = screen.getByRole('region', { name: 'Study calendar' });
  await within(calendar).findByText('09:00–10:00');
  expect(within(row(calendar)).getByText('Review')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  const search = await screen.findByRole('region', { name: 'Study log search' });
  await within(search).findByText('Found 1');
  expect(within(row(search)).getByText('Review')).toBeTruthy();
});

test('a new log has no mark', async () => {
  server([{ ...log, studyType: 'new' }]);
  render(<StudyLogScreen today={today} />);
  const editButton = await screen.findByRole('button', { name: /Edit log/ });
  expect(within(editButton.closest('li')!).queryByText('Review')).toBeNull();
});
