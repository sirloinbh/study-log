import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import { holdExactTotalsLock, withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

// Requires a dedicated test DB with database/migrations applied. Skipped (not passed) without it.
test('the count follows what is due', { skip: !url }, async (t) => {
  const pool = new Pool({ connectionString: url });
  // An early year keeps other test files' later reviews out of the count at this "today". The
  // stats test also has early rows, and counts these in its total, so the two take turns.
  const year = '0002';
  // From the very first date: a stats test killed midway may have left a row there. Its rows are
  // safe to delete here, since the lock means it is not running.
  const cleanup = () =>
    pool.query(`DELETE FROM study_logs WHERE study_date BETWEEN '0001-01-01' AND $1`, [
      `${year}-12-31`,
    ]);
  await holdExactTotalsLock(url, t, async () => {
    await cleanup();
    await pool.end();
  });
  await cleanup();

  const today = `${year}-03-02`;
  await withApi(
    pool,
    async (call) => {
      const count = async () => {
        const { status, data } = await call('/api/reviews/today/count');
        assert.equal(status, 200);
        return data.count;
      };
      const create = async (studyDate: string, status = 'done') => {
        const created = await call('/api/study-logs', {
          method: 'POST',
          body: { studyDate, startTime: '09:00', endTime: '10:00', status },
        });
        assert.equal(created.status, 201);
        return (created.data.studyLog as { id: number }).id;
      };

      assert.equal(await count(), 0);

      const overdue = await create(`${year}-02-20`);
      const due = await create(`${year}-03-01`);
      await create(`${year}-03-02`);
      await create(`${year}-02-01`, 'planned');
      assert.equal(await count(), 2, 'overdue and due today count; future and undone do not');

      const { rows } = await pool.query<{ id: number }>(
        'SELECT id FROM reviews WHERE study_log_id = $1',
        [due],
      );
      const completed = await call(`/api/reviews/${rows[0].id}/complete`, { method: 'POST' });
      assert.equal(completed.status, 200);
      assert.equal(await count(), 1, 'the next round is created but not due yet');

      assert.equal((await call(`/api/study-logs/${overdue}`, { method: 'DELETE' })).status, 204);
      assert.equal(await count(), 0);
    },
    { today: () => today },
  );
});
