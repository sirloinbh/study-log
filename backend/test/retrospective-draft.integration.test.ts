import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import type { DraftSource } from '../src/retrospective-draft.js';
import { DraftError } from '../src/retrospective-draft.js';
import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

// #362. Requires a dedicated test DB with database/migrations applied. Skipped (not passed) without
// it. Uses the week of Sunday 2093-05-03, apart from the dates other files use.
test("a draft is built from the period's records and is not saved", { skip: !url }, async (t) => {
  const pool = new Pool({ connectionString: url });
  const cleanup = async () => {
    await pool.query(
      "DELETE FROM study_logs WHERE study_date BETWEEN '2093-04-01' AND '2093-06-30'",
    );
    await pool.query(
      "DELETE FROM retrospectives WHERE period_start BETWEEN '2093-04-01' AND '2093-06-30'",
    );
  };
  await cleanup();
  t.after(async () => {
    await cleanup();
    await pool.end();
  });

  const seen: DraftSource[] = [];
  let mode: 'ok' | 'fail' | 'hold' = 'ok';
  let release: () => void = () => {};
  const drafter = async (input: DraftSource) => {
    seen.push(input);
    if (mode === 'fail')
      throw new DraftError(429, 'Too many retrospective requests. Try again in a moment');
    if (mode === 'hold') await new Promise<void>((resolve) => (release = resolve));
    return { body: 'Draft text', model: 'claude-sonnet-5-5' };
  };

  await withApi(
    pool,
    async (call) => {
      const draft = () =>
        call('/api/retrospectives/weekly/2093-05-03/draft', { method: 'POST', body: {} });
      const add = (studyDate: string, status: string, memo: string) =>
        call('/api/study-logs', {
          method: 'POST',
          body: {
            studyDate,
            startTime: '09:00',
            endTime: '10:00',
            status,
            memo,
            difficulties: 'hard part',
          },
        });

      // Nothing studied yet: refused before any paid call.
      const empty = await draft();
      assert.equal(empty.status, 400);
      assert.match(String(empty.data.error), /no study logs in this period/);
      assert.equal(seen.length, 0);

      await add('2093-05-04', 'done', 'limits');
      await add('2093-05-05', 'planned', 'not studied yet');
      await add('2093-05-11', 'done', 'next week');

      const ok = await draft();
      assert.equal(ok.status, 200);
      assert.deepEqual(ok.data, { draft: 'Draft text', model: 'claude-sonnet-5-5' });
      const [input] = seen;
      assert.deepEqual([input.kind, input.from, input.to], ['weekly', '2093-05-03', '2093-05-09']);
      assert.deepEqual(
        input.logs.map((entry) => [entry.date, entry.memo, entry.difficulties]),
        [['2093-05-04', 'limits', 'hard part']],
      );

      // Nothing is saved until the person saves.
      const written = await call('/api/retrospectives/period?kind=weekly&date=2093-05-04');
      assert.equal((written.data as { retrospective: unknown }).retrospective, null);

      // A failed call keeps its status and message.
      mode = 'fail';
      const failed = await draft();
      assert.equal(failed.status, 429);

      // A second request for the same period while one runs is refused.
      mode = 'hold';
      const first = draft();
      while (seen.length < 3) await new Promise((resolve) => setTimeout(resolve, 10));
      const second = await draft();
      assert.equal(second.status, 409);
      release();
      assert.equal((await first).status, 200);
    },
    { drafter },
  );
});
