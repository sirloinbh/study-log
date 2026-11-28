import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { expect, test } from 'vitest';

import {
  crossesMidnight,
  formatMinutes,
  previewMinutes,
  reflectionLabel,
  studiedLabel,
  type StudyLog,
} from './study-logs-data';
import { type Answer, fakeApi } from './test/fake-api';
import { render } from './test/render';
import { StudyLogScreen } from './test/study-log-screen';

type Log = {
  id: number;
  studyDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  memo: string;
  status: string;
  textbookId: number | null;
  textbookTitle: string | null;
  contentId: number | null;
  contentNumber: string | null;
  contentTitle: string | null;
  understanding: number | null;
  goalAchieved: boolean | null;
  studyType: string;
};

const today = '2026-10-22';

// Textbooks and chapters the form can link a log to (served, not recorded).
const textbooks = [
  { id: 1, title: '선형대수', author: '', edition: '' },
  { id: 2, title: '미적분', author: '', edition: '' },
];
const contents: Record<number, unknown[]> = {
  1: [
    {
      id: 11,
      parentId: null,
      number: '1',
      title: '벡터',
      children: [{ id: 12, parentId: 11, number: '1.2', title: '내적', children: [] }],
    },
  ],
  2: [{ id: 21, parentId: null, number: '', title: '극한', children: [] }],
};
const chapterOf: Record<number, { number: string; title: string }> = {
  11: { number: '1', title: '벡터' },
  12: { number: '1.2', title: '내적' },
  21: { number: '', title: '극한' },
};

// The names the API joins onto a saved log.
const named = (body: { textbookId: number | null; contentId: number | null }) => ({
  textbookTitle: textbooks.find((book) => book.id === body.textbookId)?.title ?? null,
  contentNumber: body.contentId === null ? null : chapterOf[body.contentId].number,
  contentTitle: body.contentId === null ? null : chapterOf[body.contentId].title,
});

type Options = {
  // Every write answers this error.
  reject?: { status: number; error: string };
  // Which list loads fail (1-based count of GETs); a failing load answers 500.
  failGet?: (count: number) => boolean;
  // A request with this method waits for the promise before answering.
  hold?: { method: string; until: Promise<void> };
  // The recent list's requests fail like an unreachable server.
  offline?: boolean;
};

const minutes = (start: string, end: string) => {
  const diff =
    Number(end.slice(0, 2)) * 60 +
    Number(end.slice(3)) -
    (Number(start.slice(0, 2)) * 60 + Number(start.slice(3)));
  return diff < 0 ? diff + 1440 : diff;
};

// In-memory stand-in for /api/study-logs on the shared fake. It is a handler function because the
// list needs state (saved logs come back on reload) and a count of reads.
function serve(initial: Log[] = [], options: Options = {}) {
  const { reject, failGet, hold, offline } = options;
  let gets = 0;
  const logs = [...initial];
  let nextId = 100;
  const api = fakeApi((request): Answer | undefined => {
    const { method, path } = request;
    const body = request.body as Log | undefined;
    if (path === '/api/textbooks') return { body: { textbooks } };
    const chapters = path.match(/^\/api\/textbooks\/(\d+)\/contents$/);
    if (chapters) return { body: { contents: contents[Number(chapters[1])] ?? [] } };
    // The calendar card gets empty answers; `requests` below leaves it out, so these tests see
    // only the recent list's requests and items.
    if (path.startsWith('/api/study-logs/calendar'))
      return { body: { month: '2026-10', days: [] } };
    if (path.startsWith('/api/study-logs?date=')) return { body: { studyLogs: [] } };
    if (!path.startsWith('/api/study-logs')) return undefined;
    if (offline) return { fail: 'network' };
    if (reject && method !== 'GET') return { status: reject.status, body: { error: reject.error } };
    const held = hold?.method === method ? { hold: hold.until } : {};
    const id = Number(path.split('/')[3]);
    // One log, for the form that opens it to edit (#478).
    if (method === 'GET' && /^\/api\/study-logs\/\d+$/.test(path)) {
      const found = logs.find((log) => log.id === id);
      return found
        ? { body: { studyLog: found } }
        : { status: 404, body: { error: 'Study log not found' } };
    }
    if (method === 'GET') {
      if (failGet?.(++gets)) return { status: 500, body: { error: 'Server error' } };
      const sorted = [...logs].sort((a, b) =>
        (b.studyDate + b.startTime).localeCompare(a.studyDate + a.startTime),
      );
      return { body: { studyLogs: sorted } };
    }
    if (method === 'POST') {
      const log = {
        ...body!,
        id: nextId++,
        ...named(body!),
        durationMinutes: minutes(body!.startTime, body!.endTime),
      };
      logs.push(log);
      return { status: 201, body: { studyLog: log }, ...held };
    }
    const index = logs.findIndex((log) => log.id === id);
    if (index < 0) return { status: 404, body: { error: 'Study log not found' } };
    if (method === 'PUT') {
      logs[index] = {
        ...body!,
        id,
        ...named(body!),
        durationMinutes: minutes(body!.startTime, body!.endTime),
      };
      return { body: { studyLog: logs[index] }, ...held };
    }
    logs.splice(index, 1);
    return { status: 204, ...held };
  });
  return {
    sent: api.sent,
    requested: api.requested,
    // The recent list's own requests, without the textbook, chapter and calendar side requests.
    get requests() {
      return api.requests.filter(
        (request) =>
          request.path.startsWith('/api/study-logs') &&
          !request.path.startsWith('/api/study-logs/calendar') &&
          !request.path.startsWith('/api/study-logs?date=') &&
          !(request.method === 'GET' && /^\/api\/study-logs\/\d+$/.test(request.path)),
      );
    },
    logs,
  };
}

const morning: Log = {
  id: 1,
  studyDate: '2026-10-21',
  startTime: '09:00',
  endTime: '10:30',
  durationMinutes: 90,
  memo: '선형대수 2장 행렬 곱',
  status: 'done',
  textbookId: null,
  textbookTitle: null,
  contentId: null,
  contentNumber: null,
  contentTitle: null,
  understanding: null,
  goalAchieved: null,
  studyType: 'new',
};

const entryForm = () => document.querySelector<HTMLFormElement>('form.log-form')!;
const field = (label: string) =>
  within(entryForm()).getByLabelText<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    label,
  );
const fill = (label: string, value: string) =>
  fireEvent.change(field(label), { target: { value } });
const submit = () => fireEvent.submit(entryForm());
const heading = () => within(entryForm().parentElement!).getByRole('heading', { level: 2 });
const items = () => screen.queryAllByRole('listitem').filter((li) => li.closest('.log-list'));
const item = () => {
  const [first] = items();
  expect(first).toBeDefined();
  return first;
};
const list = (name: RegExp) => within(item()).getByRole('button', { name });
const methods = (api: ReturnType<typeof serve>, method: string) =>
  api.requests.filter((request) => request.method === method);
const optionsOf = (label: string) =>
  within(field(label))
    .getAllByRole('option')
    .map((option) => option.textContent?.replaceAll('\u00a0', ' '));

// Clicks Edit on the first log and waits for the form to hold it (it is read by its id, #478).
async function edit() {
  fireEvent.click(list(/Edit log/));
  await waitFor(() => expect(heading()).toHaveTextContent(/Edit the study log/));
}

// Renders the screen and waits until the recent list has loaded (a log, or the empty notice).
async function open(api: ReturnType<typeof serve>) {
  render(<StudyLogScreen today={today} />);
  await waitFor(() => {
    expect(api.requests.filter((request) => request.method === 'GET').length).toBeGreaterThan(0);
  });
  await waitFor(() =>
    expect(screen.queryByRole('group', { name: /Loading the recent/ })).toBeNull(),
  );
}

test('recent logs show date, time range, computed duration, status and memo', async () => {
  const api = serve([morning]);
  await open(api);
  const line = within(item());
  for (const part of ['2026-10-21', '09:00–10:30', '1 h 30 min', 'Done', '선형대수 2장 행렬 곱']) {
    expect(line.getByText(part)).toBeInTheDocument();
  }
  expect(items()).toHaveLength(1);
  expect(api.requests).toEqual([{ method: 'GET', path: '/api/study-logs?limit=20' }]);
});

test('a memo is written in Markdown with a preview and shown rendered in the list (#16)', async () => {
  const api = serve([{ ...morning, memo: '# 행렬\n- 곱셈' }]);
  await open(api);
  // The list renders the memo as Markdown, cut to a few lines.
  const listed = within(item());
  expect(listed.getByRole('heading', { name: '행렬' })).toBeInTheDocument();
  expect(listed.getByRole('listitem')).toHaveTextContent('곱셈');
  expect(item().querySelector('.memo.clamp')).not.toBeNull();

  const preview = () => screen.queryByRole('region', { name: 'Memo preview' });
  expect(preview()).toBeNull();
  expect(screen.getByText(/You can use Markdown/)).toBeInTheDocument();
  fill('Memo', '## 오늘\n**굵게**');
  const shown = preview();
  expect(shown).not.toBeNull();
  expect(within(shown!).getByRole('heading', { name: '오늘' })).toBeInTheDocument();
  expect(within(shown!).getByText('굵게').tagName).toBe('STRONG');
  // The preview is not cut short like the list.
  expect(shown!.querySelector('.memo')).not.toBeNull();
  expect(shown!.querySelector('.memo.clamp')).toBeNull();
  fill('Memo', '  \n ');
  expect(preview()).toBeNull();
});

test('the memo box is large, grows with the text and takes long notes (#476)', async () => {
  await open(serve([]));
  const memo = field('Memo') as HTMLTextAreaElement;
  expect(memo.rows).toBe(16);
  expect(memo.maxLength).toBe(50000);
  expect(memo).toHaveClass('min-h-96', 'md:min-h-[60vh]', 'field-sizing-content');
});

test('an empty history says so instead of showing an empty list', async () => {
  await open(serve());
  expect(screen.getByText(/No study logs yet/)).toBeInTheDocument();
  expect(items()).toHaveLength(0);
});

test('entering a session previews its duration and saving adds it to the list', async () => {
  const api = serve();
  await open(api);
  // The date defaults to today.
  expect(field('Study date').value).toBe(today);
  fill('Start', '23:20');
  fill('End', '00:50');
  expect(entryForm().querySelector('.duration')).toHaveTextContent(
    /1 h 30 min \(ends the next day\)/,
  );
  fill('Status', 'in_progress');
  fill('Memo', '미적분 3장');
  submit();
  const saved = await screen.findByText('Saved');
  expect(saved).toHaveAttribute('role', 'status');

  expect(api.requests[1]).toEqual({
    method: 'POST',
    path: '/api/study-logs',
    body: {
      studyDate: today,
      startTime: '23:20',
      endTime: '00:50',
      memo: '미적분 3장',
      status: 'in_progress',
      textbookId: null,
      contentId: null,
      understanding: null,
      goalAchieved: null,
      studyType: 'new',
    },
  });
  // The list is reloaded from the server after saving.
  await waitFor(() => expect(items()).toHaveLength(1));
  await waitFor(() => expect(api.requests[2]?.method).toBe('GET'));
  const line = within(item());
  expect(line.getByText('23:20–00:50')).toBeInTheDocument();
  expect(line.getByText('1 h 30 min')).toBeInTheDocument();
  expect(line.getByText('In progress')).toBeInTheDocument();
  // The form is cleared for the next entry but keeps the date.
  expect(field('Start').value).toBe('');
  expect(field('Memo').value).toBe('');
  expect(field('Study date').value).toBe(today);
});

test('a rejected save shows the server message and keeps the input', async () => {
  const api = serve([], {
    reject: { status: 400, error: 'The end time must differ from the start time' },
  });
  await open(api);
  fill('Start', '10:00');
  fill('End', '10:00');
  submit();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    /The end time must differ from the start time/,
  );
  expect(field('Start').value).toBe('10:00');
  expect(field('End').value).toBe('10:00');
});

test('editing a log fills the form and saves it with PUT', async () => {
  const api = serve([morning]);
  await open(api);
  await edit();
  expect(heading()).toHaveTextContent(/Edit the study log/);
  expect(field('Start').value).toBe('09:00');
  expect(field('Memo').value).toBe('선형대수 2장 행렬 곱');
  fill('End', '11:00');
  expect(within(entryForm()).getByRole('button', { name: 'Save changes' })).toHaveAttribute(
    'type',
    'submit',
  );
  submit();

  expect(await screen.findByText('Updated')).toHaveAttribute('role', 'status');
  expect(methods(api, 'PUT')[0]).toEqual({
    method: 'PUT',
    path: '/api/study-logs/1',
    body: {
      studyDate: '2026-10-21',
      startTime: '09:00',
      endTime: '11:00',
      memo: '선형대수 2장 행렬 곱',
      status: 'done',
      textbookId: null,
      contentId: null,
      understanding: null,
      goalAchieved: null,
      studyType: 'new',
    },
  });
  await waitFor(() => expect(within(item()).getByText('09:00–11:00')).toBeInTheDocument());
  expect(within(item()).getByText('2 h')).toBeInTheDocument();
  expect(heading()).toHaveTextContent(/Add a study log/);
  // Back to a new entry for today, not the edited log's date.
  expect(field('Study date').value).toBe(today);
  expect(field('Start').value).toBe('');
});

test('deleting a log needs a second confirmation click', async () => {
  const api = serve([morning]);
  await open(api);
  fireEvent.click(list(/Delete log/));
  expect(methods(api, 'DELETE')).toHaveLength(0);
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  expect(await screen.findByText('Deleted')).toBeInTheDocument();
  expect(methods(api, 'DELETE').map((request) => request.path)).toEqual(['/api/study-logs/1']);
  await waitFor(() => expect(items()).toHaveLength(0));
});

test('cancelling an edit restores the unsaved new entry', async () => {
  const api = serve([morning]);
  await open(api);
  fill('Start', '08:00');
  await edit();
  expect(field('Study date').value).toBe('2026-10-21');
  fireEvent.click(within(entryForm()).getByRole('button', { name: 'Cancel' }));
  expect(heading()).toHaveTextContent(/Add a study log/);
  expect(field('Study date').value).toBe(today);
  expect(field('Start').value).toBe('08:00');
});

test('a failed first load reports the error instead of claiming there are no logs', async () => {
  serve([morning], { failGet: () => true });
  render(<StudyLogScreen today={today} />);
  const alert = await screen.findAllByText(/Could not load the recent logs: Server error/);
  expect(alert.length).toBeGreaterThan(0);
  expect(alert[0]).toHaveAttribute('role', 'alert');
  expect(screen.queryByText(/No study logs yet/)).toBeNull();
});

test('a failed reload after saving keeps the list already on screen', async () => {
  const api = serve([morning], { failGet: (count) => count > 1 });
  await open(api);
  fill('Start', '13:00');
  fill('End', '14:00');
  submit();
  expect(await screen.findByText('Saved')).toHaveAttribute('role', 'status');
  expect(await screen.findByRole('alert')).toHaveTextContent(/Could not load the recent logs/);
  expect(within(item()).getByText('09:00–10:30')).toBeInTheDocument();
});

test('an unreachable server shows the connection message', async () => {
  serve([], { offline: true });
  render(<StudyLogScreen today={today} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(/Cannot reach the server/);
});

test('buttons stay disabled while a delete is in flight, so it is sent once', async () => {
  let release = () => {};
  const api = serve([morning], {
    hold: { method: 'DELETE', until: new Promise<void>((r) => (release = r)) },
  });
  await open(api);
  fireEvent.click(list(/Delete log/));
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(methods(api, 'DELETE')).toHaveLength(1));
  expect(screen.getByRole('button', { name: /Delete$/ })).toHaveAttribute('aria-disabled', 'true');
  release();
  await waitFor(() => expect(items()).toHaveLength(0));
  expect(methods(api, 'DELETE')).toHaveLength(1);
});

test('saving an edit of a log deleted elsewhere leaves edit mode and reloads', async () => {
  const api = serve([morning]);
  await open(api);
  await edit();
  api.logs.splice(0, 1);
  submit();
  expect(await screen.findByRole('alert')).toHaveTextContent(/Study log not found/);
  expect(heading()).toHaveTextContent(/Add a study log/);
  await waitFor(() => expect(items()).toHaveLength(0));
});

test('a delete confirmation can be cancelled', async () => {
  const api = serve([morning]);
  await open(api);
  fireEvent.click(list(/Delete log/));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(list(/Edit log/)).toBeInTheDocument();
  expect(list(/Delete log/)).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(methods(api, 'DELETE')).toHaveLength(0);
});

test('a 404 when deleting a log shows the server message and reloads the list', async () => {
  const evening: Log = {
    ...morning,
    id: 2,
    studyDate: '2026-10-20',
    startTime: '20:00',
    endTime: '21:00',
    durationMinutes: 60,
    memo: '',
  };
  const api = serve([morning, evening]);
  await open(api);
  const [first, second] = items();
  expect(within(first).getByText('2026-10-21')).toBeInTheDocument();
  // The evening log disappears on the server before it is deleted here.
  api.logs.splice(1, 1);
  fireEvent.click(within(second).getByRole('button', { name: /Delete log/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/Study log not found/);
  await waitFor(() => expect(items()).toHaveLength(1));
});

test('fields are locked while a save is in flight', async () => {
  let release = () => {};
  const api = serve([], {
    hold: { method: 'POST', until: new Promise<void>((r) => (release = r)) },
  });
  await open(api);
  fill('Start', '13:00');
  fill('End', '14:00');
  submit();
  await waitFor(() => expect(methods(api, 'POST')).toHaveLength(1));
  // The entry form's fields (the search card below has its own lock).
  const controls = [
    ...entryForm().querySelectorAll<HTMLElement & { disabled: boolean }>('input, select, textarea'),
  ];
  expect(controls).toHaveLength(10);
  await waitFor(() =>
    expect(controls.map((control) => control.disabled)).toEqual(Array(10).fill(true)),
  );
  release();
  expect(await screen.findByText('Saved')).toHaveAttribute('role', 'status');
});

test('list buttons name the log they act on', async () => {
  await open(serve([morning]));
  // Within the recent list; the calendar card has its own buttons.
  const labels = within(document.querySelector<HTMLElement>('.log-list')!)
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label'));
  expect(labels).toEqual([
    'Edit log: 2026-10-21 09:00–10:30',
    'Delete log: 2026-10-21 09:00–10:30',
  ]);
});

test('a log can be linked to a textbook and one of its chapters', async () => {
  const api = serve();
  await open(api);
  await waitFor(() => expect(optionsOf('Textbook')).toEqual(['None', '선형대수', '미적분']));
  // Without a textbook there is no chapter to pick.
  expect(field('Chapter/section')).toBeDisabled();
  expect(optionsOf('Chapter/section')).toEqual(['Choose a textbook first']);

  fill('Textbook', '1');
  expect(field('Chapter/section')).toBeEnabled();
  // Sections are indented under their chapter.
  await waitFor(() =>
    expect(optionsOf('Chapter/section')).toEqual(['None', '1 벡터', '  1.2 내적']),
  );
  fill('Chapter/section', '12');
  fill('Start', '09:00');
  fill('End', '10:00');
  submit();

  await waitFor(() => expect(items()).toHaveLength(1));
  const post = methods(api, 'POST')[0].body as { textbookId: number; contentId: number };
  expect([post.textbookId, post.contentId]).toEqual([1, 12]);
  expect(item()).toHaveTextContent(/선형대수 · 1\.2 내적/);
  // The next entry keeps neither link.
  expect(field('Textbook').value).toBe('');
  expect(field('Chapter/section').value).toBe('');
});

test('picking another textbook clears the chapter of the previous one', async () => {
  await open(serve());
  await waitFor(() => expect(optionsOf('Textbook')).toHaveLength(3));
  fill('Textbook', '1');
  await waitFor(() => expect(optionsOf('Chapter/section')).toContain('1 벡터'));
  fill('Chapter/section', '11');
  fill('Textbook', '2');
  expect(field('Chapter/section').value).toBe('');
  await waitFor(() => expect(optionsOf('Chapter/section')).toEqual(['None', '극한']));
  fill('Textbook', '');
  expect(field('Chapter/section').value).toBe('');
  expect(optionsOf('Chapter/section')).toEqual(['Choose a textbook first']);
});

test('editing a linked log fills in its textbook and chapter', async () => {
  const linked: Log = {
    ...morning,
    textbookId: 1,
    textbookTitle: '선형대수',
    contentId: 11,
    contentNumber: '1',
    contentTitle: '벡터',
  };
  const api = serve([linked]);
  await open(api);
  expect(item()).toHaveTextContent(/선형대수 · 1 벡터/);
  await edit();
  await waitFor(() => expect(field('Textbook').value).toBe('1'));
  await waitFor(() => expect(field('Chapter/section').value).toBe('11'));
  fill('Chapter/section', '');
  submit();
  await waitFor(() => expect(methods(api, 'PUT')).toHaveLength(1));
  const body = methods(api, 'PUT')[0].body as { textbookId: number; contentId: number | null };
  expect(body.textbookId).toBe(1);
  expect(body.contentId).toBeNull();
  await waitFor(() => expect(item()).not.toHaveTextContent(/벡터/));
  expect(item()).toHaveTextContent(/선형대수/);
});

test('the self-assessment is saved with the log and shown in the list', async () => {
  const api = serve();
  await open(api);
  expect(optionsOf('Understanding')).toEqual([
    'None',
    '1 · Barely understood',
    '2 · Understood a little',
    '3 · Average',
    '4 · Mostly understood',
    '5 · Fully understood',
  ]);
  fill('Start', '09:00');
  fill('End', '10:00');
  fill('Understanding', '4');
  fill('Goal achieved', 'false');
  submit();
  await waitFor(() => expect(items()).toHaveLength(1));
  const post = methods(api, 'POST')[0].body as Record<string, unknown>;
  expect([post.understanding, post.goalAchieved]).toEqual([4, false]);
  expect(post).not.toHaveProperty('difficulties');
  expect(item()).toHaveTextContent(/Understanding 4\/5 · Goal not achieved/);
  expect(item()).not.toHaveTextContent(/Difficult parts/);
  // The next entry starts unanswered.
  expect(field('Understanding').value).toBe('');
  expect(field('Goal achieved').value).toBe('');
  expect(screen.queryByLabelText('Difficult parts')).not.toBeInTheDocument();
});

test('editing a log fills in and can clear its self-assessment', async () => {
  const assessed: Log = { ...morning, understanding: 5, goalAchieved: true };
  const api = serve([assessed]);
  await open(api);
  expect(item()).toHaveTextContent(/Understanding 5\/5 · Goal achieved/);
  await edit();
  expect(field('Understanding').value).toBe('5');
  expect(field('Goal achieved').value).toBe('true');
  fill('Understanding', '');
  fill('Goal achieved', '');
  submit();
  await waitFor(() => expect(methods(api, 'PUT')).toHaveLength(1));
  const put = methods(api, 'PUT')[0].body as Record<string, unknown>;
  expect([put.understanding, put.goalAchieved]).toEqual([null, null]);
  await waitFor(() => expect(item()).not.toHaveTextContent(/Understanding|Goal/));
});

test('reflection label joins whichever answers were given', () => {
  expect(reflectionLabel({ understanding: null, goalAchieved: null })).toBe('');
  expect(reflectionLabel({ understanding: 3, goalAchieved: null })).toBe('Understanding 3/5');
  expect(reflectionLabel({ understanding: null, goalAchieved: false })).toBe('Goal not achieved');
  expect(reflectionLabel({ understanding: 1, goalAchieved: true })).toBe(
    'Understanding 1/5 · Goal achieved',
  );
});

test('studied label shows the textbook and the chapter when there is one', () => {
  const label = (
    textbookTitle: string | null,
    contentNumber: string | null,
    contentTitle: string | null,
  ) => studiedLabel({ textbookTitle, contentNumber, contentTitle } as StudyLog);
  expect(label(null, null, null)).toBe('');
  expect(label('선형대수', null, null)).toBe('선형대수');
  expect(label('선형대수', '1.2', '내적')).toBe('선형대수 · 1.2 내적');
  expect(label('미적분', '', '극한')).toBe('미적분 · 극한');
});

test('duration preview follows the API rule and formats hours and minutes', () => {
  expect(previewMinutes('09:00', '10:30')).toBe(90);
  expect(previewMinutes('23:00', '01:00')).toBe(120);
  expect(previewMinutes('10:00', '10:00')).toBeUndefined();
  expect(previewMinutes('', '10:00')).toBeUndefined();
  expect(previewMinutes('24:00', '10:00')).toBeUndefined();
  expect(crossesMidnight('23:00', '01:00')).toBe(true);
  expect(crossesMidnight('09:00', '10:00')).toBe(false);
  expect([0, 45, 60, 90, 1439].map(formatMinutes)).toEqual([
    '0 min',
    '45 min',
    '1 h',
    '1 h 30 min',
    '23 h 59 min',
  ]);
});

// #65: the focused delete button is swapped out at each step; focus follows the flow instead of
// dropping to the page.
test('focus follows the delete flow: confirm, back on cancel, the list after', async () => {
  const api = serve([morning]);
  await open(api);
  const focusedId = () => document.activeElement?.id;
  fireEvent.click(list(/Delete log/));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(focusedId()).toBe('study-log-delete-1'));
  fireEvent.click(list(/Delete log/));
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(focusedId()).toBe('study-log-list'));
  expect(document.getElementById('study-log-list')).toHaveAttribute('tabindex', '-1');
});

test('a failed delete puts focus back on the delete button, a 404 on the list', async () => {
  for (const [reject, target] of [
    [{ status: 500, error: 'Server error' }, 'study-log-delete-1'],
    [{ status: 404, error: 'Study log not found' }, 'study-log-list'],
  ] as const) {
    const api = serve([morning], { reject });
    await open(api);
    fireEvent.click(list(/Delete log/));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(document.activeElement?.id).toBe(target));
    cleanup();
  }
});

// #75: two submits in the same tick, before the screen re-renders with `busy`, send one request.
test('a double submit in the same tick saves the log once', async () => {
  const api = serve();
  await open(api);
  fill('Start', '09:00');
  fill('End', '10:00');
  act(() => {
    submit();
    submit();
  });
  expect(await screen.findByText('Saved')).toBeInTheDocument();
  await waitFor(() => expect(items()).toHaveLength(1));
  expect(methods(api, 'POST')).toHaveLength(1);
  expect(api.logs).toHaveLength(1);
});
