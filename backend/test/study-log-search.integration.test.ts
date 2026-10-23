import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

// #18. Requires a dedicated test DB with database/migrations applied. Skipped (not passed)
// without it. Uses 2101, a year no other test file writes study logs to; every search here is
// limited to it, so rows of other files never match.
test(
  'study log search combines words, a date range and a textbook against the real database',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    const cleanup = async () => {
      await pool.query(
        "DELETE FROM study_logs WHERE study_date BETWEEN '2101-01-01' AND '2101-12-31'",
      );
      await pool.query("DELETE FROM textbooks WHERE title LIKE '[통합테스트 일지 검색]%'");
    };
    await cleanup();
    t.after(async () => {
      await cleanup();
      await pool.end();
    });

    await withApi(pool, async (call) => {
      const book = (
        (
          await call('/api/textbooks', {
            method: 'POST',
            body: { title: '[통합테스트 일지 검색] 선형대수' },
          })
        ).data.textbook as { id: number }
      ).id;
      const add = (studyDate: string, memo: string, difficulties = '', textbookId?: number) =>
        call('/api/study-logs', {
          method: 'POST',
          body: {
            studyDate,
            startTime: '09:00',
            endTime: '10:00',
            status: 'done',
            memo,
            difficulties,
            textbookId: textbookId ?? null,
          },
        });
      await add('2101-03-01', 'Eigenvalue 정리', '', book);
      await add('2101-03-15', '미적분 복습', '고유값 계산이 어려웠다');
      await add('2101-04-02', '고유벡터 연습', '', book);
      await add('2101-05-20', '50% 할인 문제', '');

      const memos = async (query: string) =>
        (
          (await call(`/api/study-logs?from=2101-01-01&to=2101-12-31&limit=100${query}`)).data
            .studyLogs as { memo: string }[]
        ).map((log) => log.memo);

      // Words in the memo or the difficulties, any case, newest first.
      assert.deepEqual(await memos('&q=고유'), ['고유벡터 연습', '미적분 복습']);
      assert.deepEqual(await memos('&q=EIGEN'), ['Eigenvalue 정리']);
      assert.deepEqual(await memos(`&q=${encodeURIComponent('50%')}`), ['50% 할인 문제']);
      assert.deepEqual(await memos(`&q=${encodeURIComponent('%')}`), ['50% 할인 문제']);
      // With a textbook, and with a narrower range.
      assert.deepEqual(await memos(`&q=고유&textbookId=${book}`), ['고유벡터 연습']);
      assert.deepEqual(await memos(`&textbookId=${book}`), ['고유벡터 연습', 'Eigenvalue 정리']);
      const march = (
        (await call('/api/study-logs?from=2101-03-01&to=2101-03-31&limit=100')).data.studyLogs as {
          memo: string;
        }[]
      ).map((log) => log.memo);
      assert.deepEqual(march, ['미적분 복습', 'Eigenvalue 정리']);
      assert.deepEqual(
        (
          (await call('/api/study-logs?q=고유&from=2101-04-01&to=2101-12-31')).data.studyLogs as {
            memo: string;
          }[]
        ).map((log) => log.memo),
        ['고유벡터 연습'],
      );
      assert.deepEqual(await memos('&q=없는말'), []);
    });
  },
);
