import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

// Requires a dedicated test DB with database/migrations applied. Skipped (not passed) without it.
test('the count follows what is due', { skip: !url }, async (t) => {
  const pool = new Pool({ connectionString: url });
  // An early year keeps other test files' later reviews out of the count at this "today".
  const year = '0002';
  const cleanup = () =>
    pool.query(`DELETE FROM study_logs WHERE study_date BETWEEN $1 AND $2`, [
      `${year}-01-01`,
      `${year}-12-31`,
    ]);
  await cleanup();
  t.after(async () => {
    await cleanup();
    await pool.end();
  });

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
