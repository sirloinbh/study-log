import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

type Card = { id: number; date: string; keyword: string; known: boolean | null };

// Requires a dedicated test DB with database/migrations applied. Skipped (not passed) without it.
test(
  'flashcards are the keywords of due reviews, answered per day and ordered by the last answer',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    // Far-future dates keep these rows apart from anything else in the test DB.
    const cleanup = async () => {
      await pool.query(
        `DELETE FROM study_logs WHERE study_date BETWEEN '7001-01-01' AND '7001-12-31'`,
      );
      await pool.query(
        `DELETE FROM keywords WHERE keyword_date BETWEEN '7001-01-01' AND '7001-12-31'`,
      );
    };
    await cleanup();
    t.after(async () => {
      await cleanup();
      await pool.end();
    });

    await withApi(pool, async (call) => {
      const log = async (studyDate: string, status = 'done') =>
        assert.equal(
          (
            await call('/api/study-logs', {
              method: 'POST',
              body: { studyDate, startTime: '09:00', endTime: '10:00', status },
            })
          ).status,
          201,
        );
      const word = async (date: string, keyword: string) => {
        const added = await call('/api/keywords', { method: 'POST', body: { date, keyword } });
        assert.equal(added.status, 201);
        return (added.data.keyword as { id: number }).id;
      };
      const cards = async (date: string) => {
        const { status, data } = await call(`/api/flashcards?date=${date}`);
        assert.equal(status, 200);
        assert.equal(data.date, date);
        return data.cards as Card[];
      };
      const names = async (date: string) => (await cards(date)).map((card) => card.keyword);

      // Reviews are due the day after studying: 02-20 is overdue on 03-02, 03-01 is due, 03-02 not yet,
      // and a planned log has no review at all.
      await log('7001-02-20');
      await log('7001-03-01');
      await log('7001-03-02');
      await log('7001-02-01', 'planned');
      const overdue = await word('7001-02-20', 'overdue');
      const due = await word('7001-03-01', 'due');
      await word('7001-03-02', 'later');
      await word('7001-02-01', 'planned');
      await word('7001-01-05', 'nolog');

      assert.deepEqual(await names('7001-03-02'), ['overdue', 'due']);
      assert.deepEqual(await names('7001-02-19'), [], 'nothing is due before the first round');
      assert.ok((await cards('7001-03-02')).every((card) => card.known === null));

      const answer = (id: number, body: object) =>
        call(`/api/flashcards/${id}`, { method: 'PUT', body });
      assert.equal((await answer(overdue, { known: false, date: '7001-03-02' })).status, 200);
      assert.equal((await answer(due, { known: true, date: '7001-03-02' })).status, 200);
      assert.deepEqual(
        (await cards('7001-03-02')).map((card) => `${card.keyword}:${card.known}`),
        ['overdue:false', 'due:true'],
        'the order does not change while the day is answered',
      );
      // Answering again the same day replaces the answer.
      assert.equal((await answer(due, { known: false, date: '7001-03-02' })).status, 200);
      assert.equal(
        (await cards('7001-03-02')).find((card) => card.keyword === 'due')?.known,
        false,
      );
      assert.equal((await answer(due, { known: true, date: '7001-03-02' })).status, 200);

      // Next day the not-known card comes first, then the one never answered, then the known one.
      assert.deepEqual(await names('7001-03-03'), ['overdue', 'later', 'due']);
      assert.ok((await cards('7001-03-03')).every((card) => card.known === null));

      assert.equal((await answer(999999999, { known: true })).status, 404);

      // Deleting a keyword takes its answers with it.
      assert.equal((await call(`/api/keywords/${overdue}`, { method: 'DELETE' })).status, 204);
      const left = await pool.query('SELECT 1 FROM keyword_cards WHERE keyword_id = $1', [overdue]);
      assert.equal(left.rowCount, 0);
    });
  },
);
