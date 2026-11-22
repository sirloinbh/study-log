import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { StudyLogs } from './study-logs';
import {
  crossesMidnight,
  formatMinutes,
  previewMinutes,
  reflectionLabel,
  studiedLabel,
  type StudyLog,
} from './study-logs-data';

// The whole page renders in each test and role queries are slow on the first run after a change.
vi.setConfig({ testTimeout: 20_000 });

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
  difficulties: string;
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
  // Throw like an unreachable server for /api/study-logs.
  offline?: boolean;
};

// In-memory stand-in for /api/study-logs that records every request the screen sends. Kept local
// because the list needs state (saved logs come back on reload) and a count of reads.
function fakeApi(initial: Log[] = [], options: Options = {}) {
  const { reject, failGet, hold, offline } = options;
  let gets = 0;
  const logs = [...initial];
  const requests: { method: string; path: string; body?: unknown }[] = [];
  let nextId = 100;
  const reply = (status: number, body?: unknown) =>
    Promise.resolve(new Response(status === 204 ? null : JSON.stringify(body ?? {}), { status }));
  const minutes = (start: string, end: string) => {
    const diff =
      Number(end.slice(0, 2)) * 60 +
      Number(end.slice(3)) -
      (Number(start.slice(0, 2)) * 60 + Number(start.slice(3)));
    return diff < 0 ? diff + 1440 : diff;
  };
  const handle = async (path: string, init: { method?: string; body?: string } = {}) => {
    const method = init.method ?? 'GET';
    const body = init.body === undefined ? undefined : JSON.parse(init.body);
    if (path === '/api/textbooks') return reply(200, { textbooks });
    const chapters = path.match(/^\/api\/textbooks\/(\d+)\/contents$/);
    if (chapters) return reply(200, { contents: contents[Number(chapters[1])] ?? [] });
    // The calendar card gets empty answers and is not recorded, so these tests see only the
    // recent list's requests and items.
    if (path.startsWith('/api/study-logs/calendar'))
      return reply(200, { month: '2026-10', days: [] });
    if (path.startsWith('/api/study-logs?date=')) return reply(200, { studyLogs: [] });
    requests.push({ method, path, ...(body === undefined ? {} : { body }) });
    if (offline) throw new TypeError('fetch failed');
    if (reject && method !== 'GET') return reply(reject.status, { error: reject.error });
    const id = Number(path.split('/')[3]);
    if (method === 'GET') {
      if (failGet?.(++gets)) return reply(500, { error: 'Server error' });
      const sorted = [...logs].sort((a, b) =>
        (b.studyDate + b.startTime).localeCompare(a.studyDate + a.startTime),
      );
      return reply(200, { studyLogs: sorted });
    }
    if (hold?.method === method) await hold.until;
    if (method === 'POST') {
      const log = {
        id: nextId++,
        ...body,
        ...named(body),
        durationMinutes: minutes(body.startTime, body.endTime),
      };
      logs.push(log);
      return reply(201, { studyLog: log });
    }
    const index = logs.findIndex((log) => log.id === id);
    if (index < 0) return reply(404, { error: 'Study log not found' });
    if (method === 'PUT') {
      logs[index] = {
        id,
        ...body,
        ...named(body),
        durationMinutes: minutes(body.startTime, body.endTime),
      };
      return reply(200, { studyLog: logs[index] });
    }
    logs.splice(index, 1);
    return reply(204);
  };
  vi.stubGlobal('fetch', vi.fn(handle));
  return { requests, logs };
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
  difficulties: '',
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
const methods = (api: ReturnType<typeof fakeApi>, method: string) =>
  api.requests.filter((request) => request.method === method);
const optionsOf = (label: string) =>
  within(field(label))
    .getAllByRole('option')
    .map((option) => option.textContent?.replaceAll('\u00a0', ' '));

// Renders the screen and waits until the recent list has loaded (a log, or the empty notice).
async function open(api: ReturnType<typeof fakeApi>) {
  render(<StudyLogs today={today} />);
  await waitFor(() => {
    expect(api.requests.filter((request) => request.method === 'GET').length).toBeGreaterThan(0);
  });
  await waitFor(() =>
    expect(screen.queryByRole('group', { name: /Loading the recent/ })).toBeNull(),
  );
}

test('recent logs show date, time range, computed duration, status and memo', async () => {
  const api = fakeApi([morning]);
  await open(api);
  const line = within(item());
  for (const part of ['2026-10-21', '09:00–10:30', '1 h 30 min', 'Done', '선형대수 2장 행렬 곱']) {
    expect(line.getByText(part)).toBeInTheDocument();
  }
  expect(items()).toHaveLength(1);
  expect(api.requests).toEqual([{ method: 'GET', path: '/api/study-logs?limit=20' }]);
});

test('a memo is written in Markdown with a preview and shown rendered in the list (#16)', async () => {
  const api = fakeApi([{ ...morning, memo: '# 행렬\n- 곱셈' }]);
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

test('an empty history says so instead of showing an empty list', async () => {
  await open(fakeApi());
  expect(screen.getByText(/No study logs yet/)).toBeInTheDocument();
  expect(items()).toHaveLength(0);
});

test('entering a session previews its duration and saving adds it to the list', async () => {
  const api = fakeApi();
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
      difficulties: '',
      goalAchieved: null,
      studyType: 'new',
    },
  });
  // The list is reloaded from the server after saving.
  await waitFor(() => expect(items()).toHaveLength(1));
  expect(api.requests[2].method).toBe('GET');
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
  const api = fakeApi([], {
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
  const api = fakeApi([morning]);
  await open(api);
  fireEvent.click(list(/log edit$/));
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
      difficulties: '',
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
  const api = fakeApi([morning]);
  await open(api);
  fireEvent.click(list(/log delete$/));
  expect(methods(api, 'DELETE')).toHaveLength(0);
  fireEvent.click(await screen.findByRole('button', { name: /log confirm deletion$/ }));
  expect(await screen.findByText('Deleted')).toBeInTheDocument();
  expect(methods(api, 'DELETE').map((request) => request.path)).toEqual(['/api/study-logs/1']);
  await waitFor(() => expect(items()).toHaveLength(0));
});

test('cancelling an edit restores the unsaved new entry', async () => {
  const api = fakeApi([morning]);
  await open(api);
  fill('Start', '08:00');
  fireEvent.click(list(/log edit$/));
  expect(field('Study date').value).toBe('2026-10-21');
  fireEvent.click(within(entryForm()).getByRole('button', { name: 'Cancel' }));
  expect(heading()).toHaveTextContent(/Add a study log/);
  expect(field('Study date').value).toBe(today);
  expect(field('Start').value).toBe('08:00');
});

test('a failed first load reports the error instead of claiming there are no logs', async () => {
  fakeApi([morning], { failGet: () => true });
  render(<StudyLogs today={today} />);
  const alert = await screen.findAllByText(/Could not load the recent logs: Server error/);
  expect(alert.length).toBeGreaterThan(0);
  expect(alert[0]).toHaveAttribute('role', 'alert');
  expect(screen.queryByText(/No study logs yet/)).toBeNull();
});

test('a failed reload after saving keeps the list already on screen', async () => {
  const api = fakeApi([morning], { failGet: (count) => count > 1 });
  await open(api);
  fill('Start', '13:00');
  fill('End', '14:00');
  submit();
  expect(await screen.findByText('Saved')).toHaveAttribute('role', 'status');
  expect(await screen.findByRole('alert')).toHaveTextContent(/Could not load the recent logs/);
  expect(within(item()).getByText('09:00–10:30')).toBeInTheDocument();
});

test('an unreachable server shows the connection message', async () => {
  fakeApi([], { offline: true });
  render(<StudyLogs today={today} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(/Cannot reach the server/);
});

test('buttons stay disabled while a delete is in flight, so it is sent once', async () => {
  let release = () => {};
  const api = fakeApi([morning], {
    hold: { method: 'DELETE', until: new Promise<void>((r) => (release = r)) },
  });
  await open(api);
  fireEvent.click(list(/log delete$/));
  fireEvent.click(await screen.findByRole('button', { name: /log confirm deletion$/ }));
  await waitFor(() => expect(methods(api, 'DELETE')).toHaveLength(1));
  expect(screen.getByRole('button', { name: /log confirm deletion$/ })).toBeDisabled();
  expect(within(entryForm()).getByRole('button', { name: /^Save/ })).toBeDisabled();
  release();
  await waitFor(() => expect(items()).toHaveLength(0));
  expect(methods(api, 'DELETE')).toHaveLength(1);
});

test('saving an edit of a log deleted elsewhere leaves edit mode and reloads', async () => {
  const api = fakeApi([morning]);
  await open(api);
  fireEvent.click(list(/log edit$/));
  api.logs.splice(0, 1);
  submit();
  expect(await screen.findByRole('alert')).toHaveTextContent(/Study log not found/);
  expect(heading()).toHaveTextContent(/Add a study log/);
  await waitFor(() => expect(items()).toHaveLength(0));
});

test('a delete confirmation can be cancelled, and deleting the edited log ends the edit', async () => {
  const api = fakeApi([morning]);
  await open(api);
  fireEvent.click(list(/log delete$/));
  fireEvent.click(list(/log cancel deletion$/));
  expect(list(/log edit$/)).toBeInTheDocument();
  expect(list(/log delete$/)).toBeInTheDocument();
  expect(within(item()).queryByRole('button', { name: /confirm deletion$/ })).toBeNull();
  expect(methods(api, 'DELETE')).toHaveLength(0);

  fireEvent.click(list(/log edit$/));
  fireEvent.click(list(/log delete$/));
  fireEvent.click(await screen.findByRole('button', { name: /log confirm deletion$/ }));
  await waitFor(() => expect(heading()).toHaveTextContent(/Add a study log/));
  expect(field('Study date').value).toBe(today);
});

test('a 404 when deleting another log keeps the current edit', async () => {
  const evening: Log = {
    ...morning,
    id: 2,
    studyDate: '2026-10-20',
    startTime: '20:00',
    endTime: '21:00',
    durationMinutes: 60,
    memo: '',
  };
  const api = fakeApi([morning, evening]);
  await open(api);
  const [first, second] = items();
  expect(within(first).getByText('2026-10-21')).toBeInTheDocument();
  fireEvent.click(within(first).getByRole('button', { name: /log edit$/ }));
  fill('Memo', '수정 중인 메모');
  // The evening log disappears on the server before it is deleted here.
  api.logs.splice(1, 1);
  fireEvent.click(within(second).getByRole('button', { name: /log delete$/ }));
  fireEvent.click(await screen.findByRole('button', { name: /log confirm deletion$/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/Study log not found/);
  expect(heading()).toHaveTextContent(/Edit the study log/);
  expect(field('Memo').value).toBe('수정 중인 메모');
  await waitFor(() => expect(items()).toHaveLength(1));
});

test('fields are locked while a save is in flight', async () => {
  let release = () => {};
  const api = fakeApi([], {
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
  expect(controls).toHaveLength(11);
  await waitFor(() =>
    expect(controls.map((control) => control.disabled)).toEqual(Array(11).fill(true)),
  );
  release();
  expect(await screen.findByText('Saved')).toHaveAttribute('role', 'status');
});

test('list buttons name the log they act on', async () => {
  await open(fakeApi([morning]));
  // Within the recent list; the calendar card has its own buttons.
  const labels = within(document.querySelector<HTMLElement>('.log-list')!)
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label'));
  expect(labels).toEqual(['2026-10-21 09:00–10:30 log edit', '2026-10-21 09:00–10:30 log delete']);
});

test('a log can be linked to a textbook and one of its chapters', async () => {
  const api = fakeApi();
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
  await open(fakeApi());
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
  const api = fakeApi([linked]);
  await open(api);
  expect(item()).toHaveTextContent(/선형대수 · 1 벡터/);
  fireEvent.click(list(/log edit$/));
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
  const api = fakeApi();
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
  fill('Difficult parts', '고유값 분해');
  submit();
  await waitFor(() => expect(items()).toHaveLength(1));
  const post = methods(api, 'POST')[0].body as Record<string, unknown>;
  expect([post.understanding, post.goalAchieved, post.difficulties]).toEqual([
    4,
    false,
    '고유값 분해',
  ]);
  expect(item()).toHaveTextContent(/Understanding 4\/5 · Goal not achieved/);
  expect(item()).toHaveTextContent(/Difficult parts: 고유값 분해/);
  // The next entry starts unanswered.
  expect(field('Understanding').value).toBe('');
  expect(field('Goal achieved').value).toBe('');
  expect(field('Difficult parts').value).toBe('');
});

test('editing a log fills in and can clear its self-assessment', async () => {
  const assessed: Log = { ...morning, understanding: 5, goalAchieved: true, difficulties: '없음' };
  const api = fakeApi([assessed]);
  await open(api);
  expect(item()).toHaveTextContent(/Understanding 5\/5 · Goal achieved/);
  fireEvent.click(list(/log edit$/));
  expect(field('Understanding').value).toBe('5');
  expect(field('Goal achieved').value).toBe('true');
  expect(field('Difficult parts').value).toBe('없음');
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
  const api = fakeApi([morning]);
  await open(api);
  const focusedId = () => document.activeElement?.id;
  fireEvent.click(list(/log delete$/));
  await waitFor(() => expect(focusedId()).toBe('study-log-delete-confirm-1'));
  fireEvent.click(list(/log cancel deletion$/));
  await waitFor(() => expect(focusedId()).toBe('study-log-delete-1'));
  fireEvent.click(list(/log delete$/));
  fireEvent.click(await screen.findByRole('button', { name: /log confirm deletion$/ }));
  await waitFor(() => expect(focusedId()).toBe('study-log-list'));
  expect(document.getElementById('study-log-list')).toHaveAttribute('tabindex', '-1');
});

test('a failed delete puts focus back on the delete button, a 404 on the list', async () => {
  for (const [reject, target] of [
    [{ status: 500, error: 'Server error' }, 'study-log-delete-1'],
    [{ status: 404, error: 'Study log not found' }, 'study-log-list'],
  ] as const) {
    const api = fakeApi([morning], { reject });
    await open(api);
    fireEvent.click(list(/log delete$/));
    fireEvent.click(await screen.findByRole('button', { name: /log confirm deletion$/ }));
    await waitFor(() => expect(document.activeElement?.id).toBe(target), { timeout: 10_000 });
    cleanup();
  }
});

// #75: two submits in the same tick, before the screen re-renders with `busy`, send one request.
test('a double submit in the same tick saves the log once', async () => {
  const api = fakeApi();
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
