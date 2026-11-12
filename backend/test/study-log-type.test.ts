import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

test('an unknown study type is an English 400 before touching the DB', async () => {
  const untouchedPool = {
    query: async () => {
      throw new Error('DB must not be queried for invalid input');
    },
    connect: async () => {
      throw new Error('DB must not be queried for invalid input');
    },
  } as unknown as Pool;
  await withApi(untouchedPool, async (call) => {
    for (const studyType of ['exam', 1, null]) {
      const { status, data } = await call('/api/study-logs', {
        method: 'POST',
        body: { studyDate: '2199-03-01', startTime: '09:00', endTime: '10:00', studyType },
      });
      assert.equal(status, 400, String(studyType));
      assert.match(String(data.error), /The study type must be new or review/);
    }
    const stats = await call('/api/stats/study-time?type=exam');
    assert.equal(stats.status, 400);
    assert.match(String(stats.data.error), /The study type must be all, new, or review/);
  });
});

// #52. Requires a dedicated test DB with database/migrations applied.
test('a log keeps its study type, new by default', { skip: !url }, async (t) => {
  const pool = new Pool({ connectionString: url });
  const day = '2199-03-01';
  const cleanup = () => pool.query('DELETE FROM study_logs WHERE study_date = $1', [day]);
  t.after(async () => {
    await cleanup();
    await pool.end();
  });
  await cleanup();

  await withApi(pool, async (call) => {
    const session = { studyDate: day, startTime: '09:00', endTime: '10:00' };
    const write = async (path: string, method: string, body: object) =>
      (await call(path, { method, body })).data.studyLog as { id: number; studyType: string };

    assert.equal((await write('/api/study-logs', 'POST', session)).studyType, 'new');
    const review = await write('/api/study-logs', 'POST', { ...session, studyType: 'review' });
    assert.equal(review.studyType, 'review');

    const read = await call(`/api/study-logs/${review.id}`);
    assert.equal((read.data.studyLog as { studyType: string }).studyType, 'review');
    const listed = await call(`/api/study-logs?date=${day}`);
    assert.deepEqual(
      (listed.data.studyLogs as { studyType: string }[]).map((log) => log.studyType),
      ['new', 'review'],
    );

    const changed = await write(`/api/study-logs/${review.id}`, 'PUT', {
      ...session,
      studyType: 'new',
    });
    assert.equal(changed.studyType, 'new');
  });
});
