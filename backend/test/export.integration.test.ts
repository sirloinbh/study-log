import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

// Requires a dedicated test DB with database/migrations applied. Skipped (not passed) without it.
test(
  'exports read the real tables: CSV escaping, grouped exercises with answers, retrospectives',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    // Far-future dates and a marker title keep these rows apart from anything else in the test DB.
    const title = 'export364-textbook';
    const cleanup = async () => {
      await pool.query(
        `DELETE FROM study_logs WHERE study_date BETWEEN '7002-01-01' AND '7002-12-31'`,
      );
      await pool.query('DELETE FROM textbooks WHERE title = $1', [title]);
      await pool.query(
        `DELETE FROM retrospectives WHERE period_start BETWEEN '7002-01-01' AND '7002-12-31'`,
      );
    };
    await cleanup();
    t.after(async () => {
      await cleanup();
      await pool.end();
    });

    const book = await pool.query<{ id: number }>(
      'INSERT INTO textbooks (title) VALUES ($1) RETURNING id',
      [title],
    );
    const textbookId = book.rows[0].id;
    const chapter = await pool.query<{ id: number }>(
      `INSERT INTO textbook_contents (textbook_id, parent_id, position, number, title)
       VALUES ($1, NULL, 0, '1', 'Vectors') RETURNING id`,
      [textbookId],
    );
    const contentId = chapter.rows[0].id;
    const exercise = await pool.query<{ id: number }>(
      `INSERT INTO exercises (textbook_id, content_id, number, body, important)
       VALUES ($1, $2, '3', 'Find u, v.', true) RETURNING id`,
      [textbookId, contentId],
    );
    await pool.query('INSERT INTO exercise_answers (exercise_id, body) VALUES ($1, $2)', [
      exercise.rows[0].id,
      'u = 1',
    ]);
    await pool.query(
      `INSERT INTO study_logs (study_date, start_time, end_time, duration_minutes, memo, status,
         textbook_id, content_id)
       VALUES ('7002-03-01', '09:00', '10:30', 90, E'first, "quoted"\nsecond', 'done', $1, $2),
              ('7002-03-02', '09:00', '09:30', 30, '=1+1', 'done', NULL, NULL)`,
      [textbookId, contentId],
    );

    await withApi(pool, async (call) => {
      const csv = await call('/api/export/study-logs.csv?from=7002-03-01&to=7002-03-02');
      assert.equal(csv.status, 200);
      const text = csv.bytes.toString();
      const lines = text.slice(1).split('\r\n');
      assert.equal(
        lines[0],
        'id,date,start,end,minutes,status,type,textbook,chapter_number,chapter,understanding,goal_achieved,difficulties,memo',
      );
      assert.match(
        text,
        /7002-03-01,09:00,10:30,90,done,new,export364-textbook,1,Vectors,,,,"first, ""quoted""\nsecond"\r\n/,
      );
      assert.match(text, /7002-03-02,09:00,09:30,30,done,new,,,,,,,'=1\+1\r\n$/);

      const narrow = await call('/api/export/study-logs.csv?from=7002-03-02&to=7002-03-02');
      assert.equal(
        narrow.bytes.toString().split('\r\n').length,
        3,
        'header, one row, trailing break',
      );

      const today = new Date().toISOString().slice(0, 10);
      const exercises = await call(`/api/export/exercises.md?from=${today}`);
      assert.equal(exercises.status, 200);
      const markdown = exercises.bytes.toString();
      assert.match(
        markdown,
        /## export364-textbook\n\n### 1 Vectors\n\n#### Problem 3 \(important\)\n\nFind u, v\.\n\n\*\*Answer\*\*\n\nu = 1\n/,
      );
    });
  },
);
