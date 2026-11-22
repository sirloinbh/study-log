import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

const url = process.env.TEST_DATABASE_URL;

// #270. Requires a dedicated test DB with database/migrations applied. Year 8051 belongs to this test alone.
test('a chapter of another textbook cannot be put on a schedule day', { skip: !url }, async (t) => {
  const pool = new Pool({ connectionString: url });
  const books: number[] = [];
  const cleanup = async () => {
    await pool.query("DELETE FROM schedules WHERE start_date = '8051-03-07'");
    if (books.length) await pool.query('DELETE FROM textbooks WHERE id = ANY($1)', [books]);
  };
  t.after(async () => {
    await cleanup();
    await pool.end();
  });

  const book = async (title: string) => {
    const { rows } = await pool.query<{ id: number }>(
      'INSERT INTO textbooks (title) VALUES ($1) RETURNING id',
      [title],
    );
    books.push(rows[0].id);
    const chapter = await pool.query<{ id: number }>(
      'INSERT INTO textbook_contents (textbook_id, position, title) VALUES ($1, 0, $2) RETURNING id',
      [rows[0].id, `${title} chapter`],
    );
    return { id: rows[0].id, chapterId: chapter.rows[0].id };
  };
  const mine = await book('schedule-270 mine');
  const other = await book('schedule-270 other');
  const { rows: schedule } = await pool.query<{ id: number }>(
    `INSERT INTO schedules (title, start_date, end_date, weekday_minutes, rest_day_minutes, textbook_id)
       VALUES ('schedule-270', '8051-03-07', '8051-03-08', 60, 0, $1) RETURNING id`,
    [mine.id],
  );
  const { rows: item } = await pool.query<{ id: number }>(
    `INSERT INTO schedule_items (schedule_id, item_date, original_date, target_minutes)
       VALUES ($1, '8051-03-07', '8051-03-07', 60) RETURNING id`,
    [schedule[0].id],
  );
  const put = (book: { id: number; chapterId: number }) =>
    pool.query(
      `INSERT INTO schedule_item_contents (schedule_item_id, textbook_id, content_id, position)
         VALUES ($1, $2, $3, 0)`,
      [item[0].id, book.id, book.chapterId],
    );

  await assert.rejects(put(other), { code: '23514' });
  await put(mine);
  const { rows } = await pool.query(
    'SELECT 1 FROM schedule_item_contents WHERE schedule_item_id = $1',
    [item[0].id],
  );
  assert.equal(rows.length, 1);
});
