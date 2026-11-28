import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

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
  understanding: null,
  difficulties: '',
  goalAchieved: null,
  studyType: 'new',
};

function server(saveStatus = 200, deleteStatus = 204) {
  const failed = { status: saveStatus, body: { error: 'Error' } };
  fakeApi({
    'GET /api/textbooks': { body: { textbooks: [] } },
    'GET /api/study-logs': { body: { studyLogs: [log] } },
    'GET /api/study-logs/calendar': {
      body: { month: today.slice(0, 7), days: [{ date: today, minutes: 60, logs: 1 }] },
    },
    'POST /api/study-logs': saveStatus < 400 ? { status: 201, body: { studyLog: log } } : failed,
    'DELETE /api/study-logs/1':
      deleteStatus === 204 ? { status: 204 } : { status: deleteStatus, body: { error: 'Error' } },
  });
}

const submit = () => fireEvent.submit(document.querySelector('form')!);

test('saving a log reports a change, since it can make a review due', async () => {
  server();
  const onChange = vi.fn();
  render(<StudyLogScreen today={today} onChange={onChange} />);
  await screen.findByRole('button', { name: /Delete log/ });
  submit();
  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
});

test('a failed save reports too: the server may have changed anyway', async () => {
  server(500);
  const onChange = vi.fn();
  render(<StudyLogScreen today={today} onChange={onChange} />);
  await screen.findByRole('button', { name: /Delete log/ });
  submit();
  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
});

test.each([
  ['deleting a log', 204],
  ['a log already deleted elsewhere', 404],
])('%s reports a change, since its reviews go with it', async (_name, status) => {
  server(200, status);
  const onChange = vi.fn();
  render(<StudyLogScreen today={today} onChange={onChange} />);
  fireEvent.click(await screen.findByRole('button', { name: /Delete log/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
});
