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
};

// In-memory stand-in for /api/study-logs that records every request the screen sends.
function fakeApi(initial: Log[] = [], reject?: { status: number; error: string }) {
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
    requests.push({ method, path, body });
    if (reject && method !== 'GET') return reply(reject.status, { error: reject.error });
    const id = Number(path.split('/')[3]);
    if (method === 'GET') {
      const sorted = [...logs].sort((a, b) =>
        (b.studyDate + b.startTime).localeCompare(a.studyDate + a.startTime),
      );
      return reply(200, { studyLogs: sorted });
    }
    if (method === 'POST') {
      const log = { id: nextId++, ...body, durationMinutes: minutes(body.startTime, body.endTime) };
      logs.push(log);
      return reply(201, { studyLog: log });
    }
    const index = logs.findIndex((log) => log.id === id);
    if (index < 0) return reply(404, { error: '학습 기록을 찾을 수 없습니다' });
    if (method === 'PUT') {
      logs[index] = { id, ...body, durationMinutes: minutes(body.startTime, body.endTime) };
      return reply(200, { studyLog: logs[index] });
    }
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
  const api = fakeApi([], { status: 400, error: '종료 시각은 시작 시각과 달라야 합니다' });
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
    },
  });
  assert.match(ui.text(ui.find((n) => n.type === 'li')[0]), /09:00–11:00.*2시간/);
  assert.match(ui.text(ui.find((n) => n.props.role === 'status')), /수정했습니다/);
  assert.match(ui.text(ui.find((n) => n.type === 'h2')), /학습 기록 입력/);
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
