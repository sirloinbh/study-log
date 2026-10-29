import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { withApi } from './helpers.js';

const untouchedPool = {
  query: async () => {
    throw new Error('DB must not be queried for invalid input');
  },
} as unknown as Pool;

// Every query fails like Postgres does when a foreign key rejects the statement.
const foreignKeyPool = (constraint: string) => {
  const query = async (sql: string) => {
    if (/^(BEGIN|ROLLBACK|COMMIT)/.test(sql)) return { rows: [], rowCount: 0 };
    if (sql.startsWith('SELECT 1 FROM textbooks')) return { rows: [{}], rowCount: 1 };
    throw Object.assign(new Error('violates foreign key constraint'), {
      code: '23503',
      constraint,
    });
  };
  return { query, connect: async () => ({ query, release: () => {} }) } as unknown as Pool;
};

const valid = { studyDate: '2026-10-21', startTime: '09:00', endTime: '10:30' };

test('textbook and chapter references are checked in Korean before touching the DB', async () => {
  const cases: [Record<string, unknown>, RegExp][] = [
    [{ ...valid, contentId: 3 }, /목차를 고르려면 교재를 먼저 선택하세요/],
    [{ ...valid, textbookId: '1' }, /교재 ID가 올바르지 않습니다/],
    [{ ...valid, textbookId: 0 }, /교재 ID가 올바르지 않습니다/],
    [{ ...valid, textbookId: 1, contentId: 2.5 }, /목차 ID가 올바르지 않습니다/],
  ];
  await withApi(untouchedPool, async (call) => {
    for (const [body, message] of cases) {
      for (const [method, path] of [
        ['POST', '/api/study-logs'],
        ['PUT', '/api/study-logs/1'],
      ]) {
        const { status, data } = await call(path, { method, body });
        assert.equal(status, 400, `${method} ${JSON.stringify(body)}`);
        assert.match(String(data.error), message);
      }
    }
    for (const id of ['0', 'abc', '1e3']) {
      const { status, data } = await call(`/api/study-logs?textbookId=${id}`);
      assert.equal(status, 400, id);
      assert.match(String(data.error), /교재 ID가 올바르지 않습니다/);
    }
  });
});

test('a missing textbook or chapter of another textbook answers a Korean 400', async () => {
  for (const [constraint, message] of [
    ['study_logs_textbook_fkey', '교재를 찾을 수 없습니다'],
    ['study_logs_content_fkey', '목차를 찾을 수 없습니다'],
  ]) {
    await withApi(foreignKeyPool(constraint), async (call) => {
      for (const [method, path] of [
        ['POST', '/api/study-logs'],
        ['PUT', '/api/study-logs/1'],
      ]) {
        const { status, data } = await call(path, {
          method,
          body: { ...valid, textbookId: 1, contentId: 2 },
        });
        assert.equal(status, 400, `${method} ${constraint}`);
        assert.equal(data.error, message);
      }
    });
  }
});

test('a textbook or chapter that study logs point to cannot be deleted', async () => {
  await withApi(foreignKeyPool('study_logs_textbook_fkey'), async (call) => {
    const book = await call('/api/textbooks/1', { method: 'DELETE' });
    assert.equal(book.status, 409);
    assert.equal(book.data.error, '학습 기록이 연결된 교재는 삭제할 수 없습니다');
  });
  await withApi(foreignKeyPool('study_logs_content_fkey'), async (call) => {
    const chapter = await call('/api/textbooks/1/contents/2', { method: 'DELETE' });
    assert.equal(chapter.status, 409);
    assert.equal(chapter.data.error, '학습 기록이 연결된 목차는 삭제할 수 없습니다');
  });
});
