import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

const message = '입력에 사용할 수 없는 문자(NUL)가 있습니다';

// #58. Requires a dedicated test DB with database/migrations applied. Skipped (not passed)
// without it.
test(
  'a NUL character anywhere in the input is a Korean 400 against the real database',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    // Nothing should be saved; the cleanup only guards against a regression that saves it.
    const cleanup = async () => {
      await pool.query("DELETE FROM textbooks WHERE title LIKE '[NUL 테스트]%'");
      await pool.query("DELETE FROM study_logs WHERE study_date = '2097-01-01'");
      await pool.query("DELETE FROM keywords WHERE keyword_date = '2097-01-01'");
    };
    await cleanup();
    const logged: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void logged.push(args);
    t.after(async () => {
      console.error = original;
      await cleanup();
      await pool.end();
    });

    await withApi(pool, async (call) => {
      for (const [path, init] of [
        ['/api/textbooks', { method: 'POST', body: { title: '[NUL 테스트] a\u0000b' } }],
        [
          '/api/study-logs',
          {
            method: 'POST',
            body: {
              studyDate: '2097-01-01',
              startTime: '09:00',
              endTime: '10:00',
              memo: '메모\u0000',
            },
          },
        ],
        ['/api/keywords', { method: 'POST', body: { date: '2097-01-01', keyword: '행\u0000렬' } }],
        ['/api/keywords?q=%00', {}],
      ] as const) {
        const { status, data } = await call(path, init);
        assert.equal(status, 400, path);
        assert.equal(data.error, message, path);
      }
    });
    assert.deepEqual(logged, [], 'no server error is logged');
  },
);
