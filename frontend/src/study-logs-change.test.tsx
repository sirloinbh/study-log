import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
};

function server(saveStatus = 200, deleteStatus = 204) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: { method?: string }) => {
      if (init?.method === 'DELETE')
        return Promise.resolve(
          deleteStatus === 204
            ? new Response(null, { status: 204 })
            : new Response(JSON.stringify({ error: '오류' }), { status: deleteStatus }),
        );
      if (init?.method && init.method !== 'GET')
        return Promise.resolve(
          new Response(JSON.stringify(saveStatus < 400 ? { studyLog: log } : { error: '오류' }), {
            status: saveStatus,
          }),
        );
      return Promise.resolve(
        new Response(
          JSON.stringify(
            url.startsWith('/api/textbooks') ? { textbooks: [] } : { studyLogs: [log] },
          ),
        ),
      );
    }),
  );
}

const submit = () => fireEvent.submit(document.querySelector('form')!);

test('saving a log reports a change, since it can make a review due', async () => {
  server();
  const onChange = vi.fn();
  render(<StudyLogs today={today} onChange={onChange} />);
  await screen.findByRole('button', { name: /삭제$/ });
  submit();
  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
});

test('a failed save reports too: the server may have changed anyway', async () => {
  server(500);
  const onChange = vi.fn();
  render(<StudyLogs today={today} onChange={onChange} />);
  await screen.findByRole('button', { name: /삭제$/ });
  submit();
  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
});

test.each([
  ['deleting a log', 204],
  ['a log already deleted elsewhere', 404],
])('%s reports a change, since its reviews go with it', async (_name, status) => {
  server(200, status);
  const onChange = vi.fn();
  render(<StudyLogs today={today} onChange={onChange} />);
  fireEvent.click(await screen.findByRole('button', { name: /삭제$/ }));
  fireEvent.click(await screen.findByRole('button', { name: /삭제 확인$/ }));
  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
});
