import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

type Textbook = { id: number; title: string; author: string; edition: string };

// Requires a dedicated test DB with database/migrations applied. Skipped (not passed) without it.
test(
  'textbooks are created, listed, updated and deleted against the real database',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    // A unique title prefix keeps these rows apart from anything else in the test DB.
    const prefix = '[통합테스트 교재]';
    const cleanup = () => pool.query('DELETE FROM textbooks WHERE title LIKE $1', [`${prefix}%`]);
    await cleanup();
    t.after(async () => {
      await cleanup();
      await pool.end();
    });

    await withApi(pool, async (call) => {
      const created = await call('/api/textbooks', {
        method: 'POST',
        body: { title: `  ${prefix} 선형대수학  `, author: 'Gilbert Strang', edition: '5판' },
      });
      assert.equal(created.status, 201);
      const book = created.data.textbook as Textbook;
      assert.deepEqual(
        { ...book, id: 0 },
        { id: 0, title: `${prefix} 선형대수학`, author: 'Gilbert Strang', edition: '5판' },
        'title is trimmed',
      );

      const minimal = await call('/api/textbooks', {
        method: 'POST',
        body: { title: `${prefix} 미적분학` },
      });
      const minimalBook = minimal.data.textbook as Textbook;
      assert.equal(minimalBook.author, '');
      assert.equal(minimalBook.edition, '');

      const listed = (await call('/api/textbooks')).data.textbooks as Textbook[];
      assert.deepEqual(
        listed.filter((item) => item.title.startsWith(prefix)).map((item) => item.title),
        [`${prefix} 미적분학`, `${prefix} 선형대수학`],
        'ordered by title',
      );

      const updated = await call(`/api/textbooks/${book.id}`, {
        method: 'PUT',
        body: { title: `${prefix} 선형대수학`, author: 'Strang', edition: '6판' },
      });
      assert.equal(updated.status, 200);
      const fetched = (await call(`/api/textbooks/${book.id}`)).data.textbook as Textbook;
      assert.equal(fetched.edition, '6판');

      assert.equal((await call(`/api/textbooks/${book.id}`, { method: 'DELETE' })).status, 204);
      assert.equal((await call(`/api/textbooks/${book.id}`)).status, 404);
    });
  },
);
