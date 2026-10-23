import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

// Past the 32-bit integer range, and the largest id the API accepts (15 digits).
const ids = [3_000_000_000, 999_999_999_999_999];

// #67. Requires a dedicated test DB with database/migrations applied. Skipped (not passed)
// without it. Rows are inserted with fixed ids (OVERRIDING SYSTEM VALUE), which leaves the
// identity sequences as they are.
test(
  'ids beyond the 32-bit range come back exactly from every API against the real database',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    const cleanup = async () => {
      await pool.query('DELETE FROM study_logs WHERE textbook_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM textbooks WHERE id = ANY($1)', [ids]);
      await pool.query('DELETE FROM keywords WHERE id = ANY($1)', [ids]);
    };
    await cleanup();
    t.after(async () => {
      await cleanup();
      await pool.end();
    });

    await withApi(pool, async (call) => {
      for (const id of ids) {
        await pool.query(
          `INSERT INTO textbooks (id, title) OVERRIDING SYSTEM VALUE VALUES ($1, '[큰 ID 테스트]')`,
          [id],
        );
        await pool.query(
          `INSERT INTO textbook_contents (id, textbook_id, parent_id, position, title)
           OVERRIDING SYSTEM VALUE VALUES ($1, $1, NULL, 0, '행렬')`,
          [id],
        );
        await pool.query(
          `INSERT INTO exercises (id, textbook_id, content_id, body)
           OVERRIDING SYSTEM VALUE VALUES ($1, $1, $1, '문제')`,
          [id],
        );
        await pool.query(
          `INSERT INTO keywords (id, keyword_date, keyword)
           OVERRIDING SYSTEM VALUE VALUES ($1, '2097-02-01', $2)`,
          [id, `큰ID${id}`],
        );

        const book = await call(`/api/textbooks/${id}`);
        assert.equal(book.status, 200, `textbook ${id}`);
        assert.equal((book.data.textbook as { id: number }).id, id);

        const contents = await call(`/api/textbooks/${id}/contents`);
        assert.equal(contents.status, 200, `contents ${id}`);
        const [chapter] = contents.data.contents as { id: number; parentId: number | null }[];
        assert.equal(chapter.id, id);
        // A section added under it gets an ordinary id and the big parent id.
        const section = await call(`/api/textbooks/${id}/contents`, {
          method: 'POST',
          body: { title: '역행렬', parentId: id },
        });
        assert.equal(section.status, 201, `section under ${id}`);
        assert.equal((section.data.content as { parentId: number }).parentId, id);

        const exercise = await call(`/api/exercises/${id}`);
        assert.equal(exercise.status, 200, `exercise ${id}`);
        assert.deepEqual(
          (({ id, textbookId, contentId }) => ({ id, textbookId, contentId }))(
            exercise.data.exercise as { id: number; textbookId: number; contentId: number },
          ),
          { id, textbookId: id, contentId: id },
        );
        const answer = await call(`/api/exercises/${id}/answer`, {
          method: 'PUT',
          body: { body: '정답' },
        });
        assert.equal(answer.status, 200, `answer ${id}`);
        assert.equal((answer.data.answer as { exerciseId: number }).exerciseId, id);

        const log = await call('/api/study-logs', {
          method: 'POST',
          body: {
            studyDate: '2097-02-01',
            startTime: '09:00',
            endTime: '10:00',
            textbookId: id,
            contentId: id,
          },
        });
        assert.equal(log.status, 201, `study log ${id}`);
        const saved = log.data.studyLog as { textbookId: number; contentId: number };
        assert.deepEqual([saved.textbookId, saved.contentId], [id, id]);

        const keyword = await call(`/api/keywords/${id}`);
        assert.equal(keyword.status, 200, `keyword ${id}`);
        assert.equal((keyword.data.keyword as { id: number }).id, id);
      }
    });
  },
);
