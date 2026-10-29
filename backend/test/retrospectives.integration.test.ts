import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

type Retrospective = { id: number; kind: string; from: string; to: string; body: string };
type Period = {
  kind: string;
  from: string;
  to: string;
  retrospective: Retrospective | null;
  summary: Record<string, number>;
};

const insert = (kind: string, from: string, to: string) =>
  `INSERT INTO retrospectives (kind, period_start, period_end, body)
   VALUES ('${kind}', '${from}', '${to}', 'x')`;

// #19. Requires a dedicated test DB with database/migrations applied. Skipped (not passed)
// without it. Uses 2102, a year no other test file writes to. 2102-03-05 is a Sunday.
test(
  'one retrospective per period, with a summary of that period, against the real database',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    const cleanup = async () => {
      await pool.query(
        "DELETE FROM retrospectives WHERE period_start BETWEEN '2102-01-01' AND '2102-12-31'",
      );
      await pool.query(
        "DELETE FROM study_logs WHERE study_date BETWEEN '2102-01-01' AND '2102-12-31'",
      );
    };
    await cleanup();
    t.after(async () => {
      await cleanup();
      await pool.end();
    });

    await withApi(
      pool,
      async (call) => {
        const log = (studyDate: string, status: string, goalAchieved: boolean | null = null) =>
          call('/api/study-logs', {
            method: 'POST',
            body: { studyDate, startTime: '09:00', endTime: '10:30', status, goalAchieved },
          });
        await log('2102-03-05', 'done', true); // Sunday: first day of the week
        await log('2102-03-05', 'in_progress', false);
        await log('2102-03-08', 'planned'); // not studied yet
        await log('2102-03-11', 'done'); // Saturday: last day of the week
        await log('2102-03-12', 'done'); // next week

        const period = async (query: string) =>
          (await call(`/api/retrospectives/period?${query}`)).data as Period;
        const week = await period('kind=weekly&date=2102-03-08');
        assert.deepEqual(
          [week.from, week.to, week.retrospective],
          ['2102-03-05', '2102-03-11', null],
        );
        assert.deepEqual(week.summary, {
          totalMinutes: 270,
          studyDays: 2,
          logs: 3,
          goalsAchieved: 1,
          goalsChecked: 2,
        });

        const write = (kind: string, start: string, body: string) =>
          call(`/api/retrospectives/${kind}/${start}`, { method: 'PUT', body: { body } });
        const first = await write('weekly', '2102-03-05', '이번 주는 행렬을 끝냈다.\n- 좋았던 점');
        assert.equal(first.status, 200);
        const saved = first.data.retrospective as Retrospective;
        assert.deepEqual(
          [saved.kind, saved.from, saved.to, saved.body],
          ['weekly', '2102-03-05', '2102-03-11', '이번 주는 행렬을 끝냈다.\n- 좋았던 점'],
        );
        // Writing the same week again edits it: still one row, same id.
        const again = await write('weekly', '2102-03-05', '고쳐 쓴 회고');
        assert.equal((again.data.retrospective as Retrospective).id, saved.id);
        const rows = await pool.query(
          "SELECT body FROM retrospectives WHERE kind = 'weekly' AND period_start = '2102-03-05'",
        );
        assert.deepEqual(rows.rows, [{ body: '고쳐 쓴 회고' }]);
        assert.equal(
          (await period('kind=weekly&date=2102-03-11')).retrospective?.body,
          '고쳐 쓴 회고',
        );

        // A monthly one for the same dates is a separate retrospective.
        await write('monthly', '2102-03-01', '3월 회고');
        const month = await period('kind=monthly&date=2102-03-20');
        assert.deepEqual(
          [month.from, month.to, month.retrospective?.body],
          ['2102-03-01', '2102-03-31', '3월 회고'],
        );
        assert.equal(month.summary.totalMinutes, 360);
        assert.equal((await period('kind=monthly&date=2102-02-10')).to, '2102-02-28');

        const list = (
          (await call('/api/retrospectives?limit=100')).data.retrospectives as Retrospective[]
        ).filter((r) => r.from.startsWith('2102'));
        assert.deepEqual(
          list.map((r) => `${r.kind}:${r.from}`),
          ['weekly:2102-03-05', 'monthly:2102-03-01'],
        );

        const removed = await call('/api/retrospectives/weekly/2102-03-05', { method: 'DELETE' });
        assert.equal(removed.status, 204);
        assert.equal((await period('kind=weekly&date=2102-03-05')).retrospective, null);

        // The database refuses a week not from Sunday, a wrong month end and a second one.
        for (const [sql, code] of [
          [insert('weekly', '2102-03-06', '2102-03-12'), '23514'],
          [insert('monthly', '2102-04-01', '2102-04-29'), '23514'],
          [insert('monthly', '2102-03-01', '2102-03-31'), '23505'],
        ] as const) {
          await assert.rejects(pool.query(sql), { code }, sql);
        }
      },
      { today: () => '2102-03-08' },
    );
  },
);
