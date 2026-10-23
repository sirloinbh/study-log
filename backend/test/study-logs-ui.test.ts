import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frontendMissing, loadFrontendModule, mount, type FetchInit } from './ui-harness.js';

const uiTest = frontendMissing ? test.skip : test;

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
};

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

// In-memory stand-in for /api/study-logs that records every request the screen sends.
type Options = {
  // Every write answers this error.
  reject?: { status: number; error: string };
  // Which list loads fail (1-based count of GETs); a failing load answers 500.
  failGet?: (count: number) => boolean;
  // When set, DELETE waits for this promise before answering.
  holdDelete?: Promise<void>;
  // Throw like an unreachable server for /api/study-logs.
  offline?: boolean;
};

function fakeApi(initial: Log[] = [], options: Options = {}) {
  const { reject, failGet, holdDelete, offline } = options;
  let gets = 0;
  const logs = [...initial];
  const requests: { method: string; path: string; body?: unknown }[] = [];
  let nextId = 100;
  const reply = (status: number, body?: unknown) => ({
    ok: status < 400,
    status,
    json: async () => body,
  });
  const minutes = (start: string, end: string) => {
    const diff =
      Number(end.slice(0, 2)) * 60 +
      Number(end.slice(3)) -
      (Number(start.slice(0, 2)) * 60 + Number(start.slice(3)));
    return diff < 0 ? diff + 1440 : diff;
  };
  const fetch = async (path: string, init: FetchInit = {}) => {
    const method = init.method ?? 'GET';
    const body = init.body === undefined ? undefined : JSON.parse(init.body);
    if (path === '/api/health') return reply(200, { ok: true, today: '2026-10-22' });
    if (path === '/api/textbooks') return reply(200, { textbooks });
    const chapters = path.match(/^\/api\/textbooks\/(\d+)\/contents$/);
    if (chapters) return reply(200, { contents: contents[Number(chapters[1])] ?? [] });
    // The calendar card (tested in calendar-ui.test.ts) gets empty answers and is not recorded,
    // so these tests see only the recent list's requests and items.
    if (path.startsWith('/api/study-logs/calendar'))
      return reply(200, { month: '2026-10', days: [] });
    if (path.startsWith('/api/study-logs?date=')) return reply(200, { studyLogs: [] });
    requests.push({ method, path, body });
    if (offline) throw new TypeError('fetch failed');
    if (reject && method !== 'GET') return reply(reject.status, { error: reject.error });
    const id = Number(path.split('/')[3]);
    if (method === 'GET') {
      if (failGet?.(++gets)) return reply(500, { error: '서버 오류가 발생했습니다' });
      const sorted = [...logs].sort((a, b) =>
        (b.studyDate + b.startTime).localeCompare(a.studyDate + a.startTime),
      );
      return reply(200, { studyLogs: sorted });
    }
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
    if (index < 0) return reply(404, { error: '학습 기록을 찾을 수 없습니다' });
    if (method === 'PUT') {
      logs[index] = {
        id,
        ...body,
        ...named(body),
        durationMinutes: minutes(body.startTime, body.endTime),
      };
      return reply(200, { studyLog: logs[index] });
    }
    await holdDelete;
    logs.splice(index, 1);
    return reply(204);
  };
  return { fetch, requests, logs };
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
};

uiTest('recent logs show date, time range, computed duration, status and memo', async () => {
  const api = fakeApi([morning]);
  const ui = mount(api.fetch);
  await ui.settle();
  const [item] = ui.find((n) => n.type === 'li');
  assert.ok(item, 'one recent log');
  const line = ui.text(item);
  for (const part of ['2026-10-21', '09:00–10:30', '1시간 30분', '완료', '선형대수 2장 행렬 곱']) {
    assert.ok(line.includes(part), `${part} in ${line}`);
  }
  assert.deepEqual(api.requests, [
    { method: 'GET', path: '/api/study-logs?limit=20', body: undefined },
  ]);
});

uiTest('an empty history says so instead of showing an empty list', async () => {
  const ui = mount(fakeApi().fetch);
  await ui.settle();
  assert.match(ui.text(), /아직 학습 기록이 없습니다/);
  assert.equal(ui.find((n) => n.type === 'li').length, 0);
});

uiTest('entering a session previews its duration and saving adds it to the list', async () => {
  const api = fakeApi();
  const ui = mount(api.fetch);
  await ui.settle();
  // The date defaults to the server's today.
  assert.equal(ui.field('학습일'), '2026-10-22');
  await ui.fill('시작', '23:20');
  await ui.fill('종료', '00:50');
  assert.match(
    ui.text(ui.find((n) => n.props.className === 'duration wide')),
    /1시간 30분 \(다음 날 종료\)/,
  );
  await ui.fill('상태', 'in_progress');
  await ui.fill('메모', '미적분 3장');
  await ui.submit();

  assert.deepEqual(api.requests[1], {
    method: 'POST',
    path: '/api/study-logs',
    body: {
      studyDate: '2026-10-22',
      startTime: '23:20',
      endTime: '00:50',
      memo: '미적분 3장',
      status: 'in_progress',
      textbookId: null,
      contentId: null,
      understanding: null,
      difficulties: '',
      goalAchieved: null,
    },
  });
  // The list is reloaded from the server after saving.
  assert.equal(api.requests[2].method, 'GET');
  const [item] = ui.find((n) => n.type === 'li');
  assert.match(ui.text(item), /23:20–00:50.*1시간 30분.*진행 중/);
  assert.match(ui.text(ui.find((n) => n.props.role === 'status')), /저장했습니다/);
  // The form is cleared for the next entry but keeps the date.
  assert.equal(ui.field('시작'), '');
  assert.equal(ui.field('메모'), '');
  assert.equal(ui.field('학습일'), '2026-10-22');
});

uiTest('a rejected save shows the server Korean message and keeps the input', async () => {
  const api = fakeApi([], {
    reject: { status: 400, error: '종료 시각은 시작 시각과 달라야 합니다' },
  });
  const ui = mount(api.fetch);
  await ui.settle();
  await ui.fill('시작', '10:00');
  await ui.fill('종료', '10:00');
  await ui.submit();
  assert.match(
    ui.text(ui.find((n) => n.props.role === 'alert')),
    /종료 시각은 시작 시각과 달라야 합니다/,
  );
  assert.equal(ui.field('시작'), '10:00');
  assert.equal(ui.field('종료'), '10:00');
});

uiTest('editing a log fills the form and saves it with PUT', async () => {
  const api = fakeApi([morning]);
  const ui = mount(api.fetch);
  await ui.settle();
  await ui.click('수정', ui.find((n) => n.type === 'li')[0]);
  assert.match(ui.text(ui.find((n) => n.type === 'h2')), /학습 기록 수정/);
  assert.equal(ui.field('시작'), '09:00');
  assert.equal(ui.field('메모'), '선형대수 2장 행렬 곱');
  await ui.fill('종료', '11:00');
  const [submit] = ui.find((n) => n.type === 'button' && n.props.type === 'submit');
  assert.equal(ui.text(submit), '수정 저장');
  await ui.submit();

  const put = api.requests.find((request) => request.method === 'PUT');
  assert.deepEqual(put, {
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
    },
  });
  assert.match(ui.text(ui.find((n) => n.type === 'li')[0]), /09:00–11:00.*2시간/);
  assert.match(ui.text(ui.find((n) => n.props.role === 'status')), /수정했습니다/);
  assert.match(ui.text(ui.find((n) => n.type === 'h2')), /학습 기록 입력/);
  // Back to a new entry for today, not the edited log's date.
  assert.equal(ui.field('학습일'), '2026-10-22');
  assert.equal(ui.field('시작'), '');
});

uiTest('deleting a log needs a second confirmation click', async () => {
  const api = fakeApi([morning]);
  const ui = mount(api.fetch);
  await ui.settle();
  await ui.click('삭제', ui.find((n) => n.type === 'li')[0]);
  assert.equal(api.requests.filter((request) => request.method === 'DELETE').length, 0);
  await ui.click('삭제 확인');
  assert.deepEqual(
    api.requests.filter((request) => request.method === 'DELETE').map((request) => request.path),
    ['/api/study-logs/1'],
  );
  assert.equal(ui.find((n) => n.type === 'li').length, 0);
  assert.match(ui.text(), /삭제했습니다/);
});

uiTest('cancelling an edit restores the unsaved new entry', async () => {
  const ui = mount(fakeApi([morning]).fetch);
  await ui.settle();
  await ui.fill('시작', '08:00');
  await ui.click('수정', ui.find((n) => n.type === 'li')[0]);
  assert.equal(ui.field('학습일'), '2026-10-21');
  await ui.click('취소', ui.find((n) => n.type === 'form')[0]);
  assert.match(ui.text(ui.find((n) => n.type === 'h2')), /학습 기록 입력/);
  assert.equal(ui.field('학습일'), '2026-10-22');
  assert.equal(ui.field('시작'), '08:00');
});

uiTest('a failed first load reports the error instead of claiming there are no logs', async () => {
  const ui = mount(fakeApi([morning], { failGet: () => true }).fetch);
  await ui.settle();
  assert.match(
    ui.text(ui.find((n) => n.props.role === 'alert')),
    /최근 기록을 불러오지 못했습니다: 서버 오류가 발생했습니다/,
  );
  assert.doesNotMatch(ui.text(), /아직 학습 기록이 없습니다/);
});

uiTest('a failed reload after saving keeps the list already on screen', async () => {
  const api = fakeApi([morning], { failGet: (count) => count > 1 });
  const ui = mount(api.fetch);
  await ui.settle();
  await ui.fill('시작', '13:00');
  await ui.fill('종료', '14:00');
  await ui.submit();
  assert.match(ui.text(ui.find((n) => n.props.role === 'status')), /저장했습니다/);
  assert.match(
    ui.text(ui.find((n) => n.props.role === 'alert')),
    /최근 기록을 불러오지 못했습니다/,
  );
  assert.match(ui.text(ui.find((n) => n.type === 'li')), /09:00–10:30/);
});

uiTest('an unreachable server shows the connection message', async () => {
  const ui = mount(fakeApi([], { offline: true }).fetch);
  await ui.settle();
  assert.match(ui.text(ui.find((n) => n.props.role === 'alert')), /서버에 연결할 수 없습니다/);
});

uiTest('buttons stay disabled while a delete is in flight, so it is sent once', async () => {
  let release = () => {};
  const api = fakeApi([morning], { holdDelete: new Promise<void>((r) => (release = r)) });
  const ui = mount(api.fetch);
  await ui.settle();
  await ui.click('삭제', ui.find((n) => n.type === 'li')[0]);
  await ui.click('삭제 확인');
  const disabled = ui
    .find((n) => n.type === 'button')
    .filter((n) => ['삭제 확인', '저장'].includes(ui.text(n)))
    .map((n) => n.props.disabled);
  assert.deepEqual(disabled, [true, true]);
  release();
  await ui.settle();
  assert.equal(api.requests.filter((request) => request.method === 'DELETE').length, 1);
  assert.equal(ui.find((n) => n.type === 'li').length, 0);
});

uiTest('saving an edit of a log deleted elsewhere leaves edit mode and reloads', async () => {
  const api = fakeApi([morning]);
  const ui = mount(api.fetch);
  await ui.settle();
  await ui.click('수정', ui.find((n) => n.type === 'li')[0]);
  api.logs.splice(0, 1);
  await ui.submit();
  assert.match(ui.text(ui.find((n) => n.props.role === 'alert')), /학습 기록을 찾을 수 없습니다/);
  assert.match(ui.text(ui.find((n) => n.type === 'h2')), /학습 기록 입력/);
  assert.equal(ui.find((n) => n.type === 'li').length, 0);
});

uiTest(
  'a delete confirmation can be cancelled, and deleting the edited log ends the edit',
  async () => {
    const api = fakeApi([morning]);
    const ui = mount(api.fetch);
    await ui.settle();
    await ui.click('삭제', ui.find((n) => n.type === 'li')[0]);
    await ui.click('취소', ui.find((n) => n.type === 'li')[0]);
    assert.match(ui.text(ui.find((n) => n.type === 'li')[0]), /수정삭제$/);
    assert.equal(api.requests.filter((request) => request.method === 'DELETE').length, 0);

    await ui.click('수정', ui.find((n) => n.type === 'li')[0]);
    await ui.click('삭제', ui.find((n) => n.type === 'li')[0]);
    await ui.click('삭제 확인');
    assert.match(ui.text(ui.find((n) => n.type === 'h2')), /학습 기록 입력/);
    assert.equal(ui.field('학습일'), '2026-10-22');
  },
);

uiTest('a 404 when deleting another log keeps the current edit', async () => {
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
  const ui = mount(api.fetch);
  await ui.settle();
  const [first, second] = ui.find((n) => n.type === 'li');
  assert.match(ui.text(first), /2026-10-21/);
  await ui.click('수정', first);
  await ui.fill('메모', '수정 중인 메모');
  // The evening log disappears on the server before it is deleted here.
  api.logs.splice(1, 1);
  await ui.click('삭제', second);
  await ui.click('삭제 확인');
  assert.match(ui.text(ui.find((n) => n.props.role === 'alert')), /학습 기록을 찾을 수 없습니다/);
  assert.match(ui.text(ui.find((n) => n.type === 'h2')), /학습 기록 수정/);
  assert.equal(ui.field('메모'), '수정 중인 메모');
  assert.equal(ui.find((n) => n.type === 'li').length, 1);
});

uiTest('fields are locked while a save is in flight', async () => {
  let release = () => {};
  const hold = new Promise<void>((r) => (release = r));
  const api = fakeApi();
  const ui = mount(async (path, init) => {
    if (init?.method === 'POST') await hold;
    return api.fetch(path, init);
  });
  await ui.settle();
  await ui.fill('시작', '13:00');
  await ui.fill('종료', '14:00');
  await ui.submit();
  const disabled = ui
    .find((n) => ['input', 'select', 'textarea'].includes(String(n.type)))
    .map((n) => n.props.disabled);
  assert.deepEqual(disabled, [true, true, true, true, true, true, true, true, true, true]);
  release();
  await ui.settle();
  assert.match(ui.text(ui.find((n) => n.props.role === 'status')), /저장했습니다/);
});

uiTest('list buttons name the log they act on', async () => {
  const ui = mount(fakeApi([morning]).fetch);
  await ui.settle();
  // Within the recent list; the calendar card has its own buttons.
  const [list] = ui.find((n) => n.props.className === 'log-list');
  const labels = ui
    .find((n) => n.type === 'button' && typeof n.props['aria-label'] === 'string', list)
    .map((n) => n.props['aria-label']);
  assert.deepEqual(labels, [
    '2026-10-21 09:00–10:30 기록 수정',
    '2026-10-21 09:00–10:30 기록 삭제',
  ]);
});

const optionsOf = (ui: ReturnType<typeof mount>, label: string) =>
  ui
    .find((n) => n.type === 'label' && ui.text(n).startsWith(label))
    .flatMap((n) => ui.find((c) => c.type === 'option', n))
    .map((n) => ui.text(n));

uiTest('a log can be linked to a textbook and one of its chapters', async () => {
  const api = fakeApi();
  const ui = mount(api.fetch);
  await ui.settle();
  assert.deepEqual(optionsOf(ui, '교재'), ['선택 안 함', '선형대수', '미적분']);
  // Without a textbook there is no chapter to pick.
  const chapterSelect = () =>
    ui
      .find((n) => n.type === 'label' && ui.text(n).startsWith('장/절'))
      .flatMap((n) => ui.find((c) => c.type === 'select', n))[0];
  assert.equal(chapterSelect().props.disabled, true);
  assert.deepEqual(optionsOf(ui, '장/절'), ['교재를 먼저 선택']);

  await ui.fill('교재', '1');
  assert.equal(chapterSelect().props.disabled, false);
  // Sections are indented under their chapter.
  assert.deepEqual(optionsOf(ui, '장/절'), ['선택 안 함', '1 벡터', '  1.2 내적']);
  await ui.fill('장/절', '12');
  await ui.fill('시작', '09:00');
  await ui.fill('종료', '10:00');
  await ui.submit();

  const post = api.requests.find((request) => request.method === 'POST')?.body as {
    textbookId: number;
    contentId: number;
  };
  assert.deepEqual([post.textbookId, post.contentId], [1, 12]);
  assert.match(ui.text(ui.find((n) => n.type === 'li')[0]), /선형대수 · 1\.2 내적/);
  // The next entry keeps neither link.
  assert.equal(ui.field('교재'), '');
  assert.equal(ui.field('장/절'), '');
});

uiTest('picking another textbook clears the chapter of the previous one', async () => {
  const api = fakeApi();
  const ui = mount(api.fetch);
  await ui.settle();
  await ui.fill('교재', '1');
  await ui.fill('장/절', '11');
  await ui.fill('교재', '2');
  assert.equal(ui.field('장/절'), '');
  assert.deepEqual(optionsOf(ui, '장/절'), ['선택 안 함', '극한']);
  await ui.fill('교재', '');
  assert.equal(ui.field('장/절'), '');
  assert.deepEqual(optionsOf(ui, '장/절'), ['교재를 먼저 선택']);
});

uiTest('editing a linked log fills in its textbook and chapter', async () => {
  const linked: Log = {
    ...morning,
    textbookId: 1,
    textbookTitle: '선형대수',
    contentId: 11,
    contentNumber: '1',
    contentTitle: '벡터',
  };
  const api = fakeApi([linked]);
  const ui = mount(api.fetch);
  await ui.settle();
  assert.match(ui.text(ui.find((n) => n.type === 'li')[0]), /선형대수 · 1 벡터/);
  await ui.click('수정', ui.find((n) => n.type === 'li')[0]);
  assert.equal(ui.field('교재'), 1);
  assert.equal(ui.field('장/절'), 11);
  await ui.fill('장/절', '');
  await ui.submit();
  const put = api.requests.find((request) => request.method === 'PUT');
  assert.equal((put?.body as { textbookId: number }).textbookId, 1);
  assert.equal((put?.body as { contentId: number | null }).contentId, null);
  assert.match(ui.text(ui.find((n) => n.type === 'li')[0]), /선형대수/);
  assert.doesNotMatch(ui.text(ui.find((n) => n.type === 'li')[0]), /벡터/);
});

uiTest('the self-assessment is saved with the log and shown in the list', async () => {
  const api = fakeApi();
  const ui = mount(api.fetch);
  await ui.settle();
  assert.deepEqual(optionsOf(ui, '이해도'), [
    '선택 안 함',
    '1 · 거의 모름',
    '2 · 조금 이해',
    '3 · 보통',
    '4 · 대부분 이해',
    '5 · 완전히 이해',
  ]);
  await ui.fill('시작', '09:00');
  await ui.fill('종료', '10:00');
  await ui.fill('이해도', '4');
  await ui.fill('목표 달성', 'false');
  await ui.fill('어려웠던 부분', '고유값 분해');
  await ui.submit();
  const post = api.requests.find((request) => request.method === 'POST')?.body as Record<
    string,
    unknown
  >;
  assert.deepEqual(
    [post.understanding, post.goalAchieved, post.difficulties],
    [4, false, '고유값 분해'],
  );
  const item = ui.text(ui.find((n) => n.type === 'li')[0]);
  assert.match(item, /이해도 4\/5 · 목표 미달성/);
  assert.match(item, /어려웠던 부분: 고유값 분해/);
  // The next entry starts unanswered.
  assert.equal(ui.field('이해도'), '');
  assert.equal(ui.field('목표 달성'), '');
  assert.equal(ui.field('어려웠던 부분'), '');
});

uiTest('editing a log fills in and can clear its self-assessment', async () => {
  const assessed: Log = { ...morning, understanding: 5, goalAchieved: true, difficulties: '없음' };
  const api = fakeApi([assessed]);
  const ui = mount(api.fetch);
  await ui.settle();
  assert.match(ui.text(ui.find((n) => n.type === 'li')[0]), /이해도 5\/5 · 목표 달성/);
  await ui.click('수정', ui.find((n) => n.type === 'li')[0]);
  assert.equal(ui.field('이해도'), 5);
  assert.equal(ui.field('목표 달성'), 'true');
  assert.equal(ui.field('어려웠던 부분'), '없음');
  await ui.fill('이해도', '');
  await ui.fill('목표 달성', '');
  await ui.submit();
  const put = api.requests.find((request) => request.method === 'PUT')?.body as Record<
    string,
    unknown
  >;
  assert.deepEqual([put.understanding, put.goalAchieved], [null, null]);
  assert.doesNotMatch(ui.text(ui.find((n) => n.type === 'li')[0]), /이해도|목표/);
});

uiTest('reflection label joins whichever answers were given', () => {
  const logic = loadFrontendModule<{
    reflectionLabel(log: { understanding: number | null; goalAchieved: boolean | null }): string;
  }>('study-logs.ts');
  assert.equal(logic.reflectionLabel({ understanding: null, goalAchieved: null }), '');
  assert.equal(logic.reflectionLabel({ understanding: 3, goalAchieved: null }), '이해도 3/5');
  assert.equal(logic.reflectionLabel({ understanding: null, goalAchieved: false }), '목표 미달성');
  assert.equal(
    logic.reflectionLabel({ understanding: 1, goalAchieved: true }),
    '이해도 1/5 · 목표 달성',
  );
});

uiTest('studied label shows the textbook and the chapter when there is one', () => {
  const logic = loadFrontendModule<{
    studiedLabel(log: Record<string, unknown>): string;
  }>('study-logs.ts');
  const none = { textbookTitle: null, contentNumber: null, contentTitle: null };
  assert.equal(logic.studiedLabel(none), '');
  assert.equal(logic.studiedLabel({ ...none, textbookTitle: '선형대수' }), '선형대수');
  assert.equal(
    logic.studiedLabel({ textbookTitle: '선형대수', contentNumber: '1.2', contentTitle: '내적' }),
    '선형대수 · 1.2 내적',
  );
  assert.equal(
    logic.studiedLabel({ textbookTitle: '미적분', contentNumber: '', contentTitle: '극한' }),
    '미적분 · 극한',
  );
});

uiTest('duration preview follows the API rule and formats hours and minutes', () => {
  const logic = loadFrontendModule<{
    previewMinutes(start: string, end: string): number | undefined;
    crossesMidnight(start: string, end: string): boolean;
    formatMinutes(total: number): string;
  }>('study-logs.ts');
  assert.equal(logic.previewMinutes('09:00', '10:30'), 90);
  assert.equal(logic.previewMinutes('23:00', '01:00'), 120);
  assert.equal(logic.previewMinutes('10:00', '10:00'), undefined);
  assert.equal(logic.previewMinutes('', '10:00'), undefined);
  assert.equal(logic.previewMinutes('24:00', '10:00'), undefined);
  assert.equal(logic.crossesMidnight('23:00', '01:00'), true);
  assert.equal(logic.crossesMidnight('09:00', '10:00'), false);
  assert.deepEqual([0, 45, 60, 90, 1439].map(logic.formatMinutes), [
    '0분',
    '45분',
    '1시간',
    '1시간 30분',
    '23시간 59분',
  ]);
});

// #65: the focused delete button is swapped out at each step; focus follows the flow instead of
// dropping to the page.
// Records focused ids. Set `state.ui` to the mounted UI, so an id with no element in the
// rendered tree (a typo) fails instead of being focused.
const focusRecorder = () => {
  const focused: string[] = [];
  const state: { ui?: ReturnType<typeof mount> } = {};
  const document = {
    getElementById: (id: string) => {
      if (state.ui && state.ui.find((n) => n.props.id === id).length !== 1)
        throw new Error(`no element #${id} to focus`);
      return { focus: () => focused.push(id) };
    },
  };
  return { focused, document, state };
};

uiTest('focus follows the delete flow: confirm, back on cancel, the list after', async () => {
  const { focused, document, state } = focusRecorder();
  const ui = mount(fakeApi([morning]).fetch, { document });
  state.ui = ui;
  await ui.settle();
  const item = () => ui.find((n) => n.type === 'li')[0];
  await ui.click('삭제', item());
  assert.deepEqual(focused, ['study-log-delete-confirm-1']);
  await ui.click('취소', item());
  assert.deepEqual(focused.at(-1), 'study-log-delete-1');
  await ui.click('삭제', item());
  await ui.click('삭제 확인', item());
  assert.deepEqual(focused.at(-1), 'study-log-list');
  const [heading] = ui.find((n) => n.props.id === 'study-log-list');
  assert.equal(heading.props.tabIndex, -1);
});

uiTest('a failed delete puts focus back on the delete button, a 404 on the list', async () => {
  for (const [reject, target] of [
    [{ status: 500, error: '서버 오류가 발생했습니다' }, 'study-log-delete-1'],
    [{ status: 404, error: '학습 기록을 찾을 수 없습니다' }, 'study-log-list'],
  ] as const) {
    const { focused, document, state } = focusRecorder();
    const ui = mount(fakeApi([morning], { reject }).fetch, { document });
    state.ui = ui;
    await ui.settle();
    await ui.click('삭제', ui.find((n) => n.type === 'li')[0]);
    await ui.click('삭제 확인');
    assert.equal(focused.at(-1), target, String(reject.status));
  }
});

// #75: two submits in the same tick, before the screen re-renders with `busy`, send one request.
uiTest('a double submit in the same tick saves the log once', async () => {
  const api = fakeApi();
  const ui = mount(api.fetch);
  await ui.settle();
  await ui.fill('시작', '09:00');
  await ui.fill('종료', '10:00');
  const [form] = ui.find((n) => n.type === 'form');
  const onSubmit = form.props.onSubmit as (event: { preventDefault(): void }) => unknown;
  void onSubmit({ preventDefault() {} });
  void onSubmit({ preventDefault() {} });
  await ui.settle();
  assert.equal(api.requests.filter((r) => r.method === 'POST').length, 1);
  assert.equal(api.logs.length, 1);
});
