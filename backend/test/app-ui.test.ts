import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frontendMissing, mount } from './ui-harness.js';

const healthy = async (path: string) => ({
  ok: true,
  json: async () =>
    path === '/api/health' ? { ok: true, today: '2026-10-19' } : { studyLogs: [], textbooks: [] },
});

const uiTest = frontendMissing ? test.skip : test;

uiTest('the shell shows the app title, navigation and a connected status', async () => {
  const ui = mount(healthy);
  await ui.settle();
  assert.match(ui.text(), /공부 기록/);
  assert.ok(ui.find((n) => n.type === 'nav').length === 1);
  const [status] = ui.find((n) => n.props.role === 'status');
  assert.match(ui.text(status), /서버 연결됨 · 2026-10-19/);
});

uiTest('an unreachable API shows a Korean alert instead of a crash', async () => {
  const ui = mount(async () => {
    throw new Error('offline');
  });
  await ui.settle();
  const alert = ui.find((n) => n.props.role === 'alert');
  assert.match(ui.text(alert), /서버에 연결할 수 없습니다/);
  // Without a server there is nothing to save to, so the study log form stays hidden.
  assert.equal(ui.find((n) => n.type === 'form').length, 0);
});

uiTest('navigation switches the page heading', async () => {
  const ui = mount(healthy);
  await ui.settle();
  assert.match(ui.text(ui.find((n) => n.type === 'h1')), /학습 기록/);
  await ui.click('설정');
  assert.match(ui.text(ui.find((n) => n.type === 'h1')), /설정/);
});
