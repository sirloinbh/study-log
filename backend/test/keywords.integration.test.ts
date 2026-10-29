import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

type Keyword = { id: number; date: string; keyword: string; memo: string };

// Requires a dedicated test DB with database/migrations applied. Skipped (not passed) without it.
test(
  'keywords are kept per date, searched, updated and deleted against the real database',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    // Far-future dates keep these rows apart from anything else in the test DB.
    const days = ['2098-05-01', '2098-05-02', '2098-05-03'];
    const range = `from=${days[0]}&to=${days[2]}`;
    const cleanup = () => pool.query('DELETE FROM keywords WHERE keyword_date = ANY($1)', [days]);
    await cleanup();
    t.after(async () => {
      await cleanup();
      await pool.end();
    });

    await withApi(
      pool,
      async (call) => {
        const add = async (body: object) => call('/api/keywords', { method: 'POST', body });
        const today = await add({ keyword: '고유값', memo: 'Ax = λx 인 λ' });
        assert.equal(today.status, 201);
        const first = today.data.keyword as Keyword;
        assert.deepEqual(
          { ...first, id: 0 },
          { id: 0, date: days[2], keyword: '고유값', memo: 'Ax = λx 인 λ' },
          'no date means today',
        );
        await add({ keyword: '대각화', date: days[2] });
        await add({ keyword: '행렬식', date: days[0], memo: '50% 확률 예제' });
        await add({ keyword: 'Rank', date: days[1] });

        // Same keyword on the same day, in any case, is refused; another day is fine.
        const again = await add({ keyword: '고유값', date: days[2] });
        assert.equal(again.status, 409);
        assert.equal(again.data.error, '이 날짜에 이미 있는 키워드입니다');
        assert.equal((await add({ keyword: 'rank', date: days[1] })).status, 409);
        assert.equal((await add({ keyword: '고유값', date: days[1] })).status, 201);

        const words = async (query: string) =>
          ((await call(`/api/keywords?${query}`)).data.keywords as Keyword[]).map(
            (k) => `${k.date.slice(-2)}:${k.keyword}`,
          );
        assert.deepEqual(await words(`date=${days[2]}`), ['03:고유값', '03:대각화']);
        // A date asks for that day only; search filters are not applied on top.
        assert.deepEqual(await words(`date=${days[2]}&q=없는말`), ['03:고유값', '03:대각화']);
        // Search covers keyword and memo, ignores case, newest date first.
        assert.deepEqual(await words(`q=고유&${range}`), ['03:고유값', '02:고유값']);
        assert.deepEqual(await words(`q=RANK&${range}`), ['02:Rank']);
        assert.deepEqual(await words(`q=λ&${range}`), ['03:고유값']);
        assert.deepEqual(await words(`q=${encodeURIComponent('50%')}&${range}`), ['01:행렬식']);
        assert.deepEqual(await words(`q=${encodeURIComponent('%')}&${range}`), ['01:행렬식']);
        assert.deepEqual(await words(`from=${days[1]}&to=${days[1]}`), ['02:Rank', '02:고유값']);

        const updated = await call(`/api/keywords/${first.id}`, {
          method: 'PUT',
          body: { keyword: '고유벡터', date: days[0], memo: '' },
        });
        assert.equal(updated.status, 200);
        assert.deepEqual((await call(`/api/keywords/${first.id}`)).data.keyword, {
          id: first.id,
          date: days[0],
          keyword: '고유벡터',
          memo: '',
        });
        // Moving onto a day that already has the keyword is refused too.
        const clash = await call(`/api/keywords/${first.id}`, {
          method: 'PUT',
          body: { keyword: '대각화', date: days[2] },
        });
        assert.equal(clash.status, 409);

        assert.equal((await call(`/api/keywords/${first.id}`, { method: 'DELETE' })).status, 204);
        assert.equal((await call(`/api/keywords/${first.id}`)).status, 404);

        // The database refuses blank, padded and over-long keywords on its own.
        for (const keyword of ['', ' 행렬', 'x'.repeat(51)]) {
          await assert.rejects(
            pool.query('INSERT INTO keywords (keyword_date, keyword) VALUES ($1, $2)', [
              days[0],
              keyword,
            ]),
            { code: '23514' },
            JSON.stringify(keyword),
          );
        }
      },
      { today: () => days[2] },
    );
  },
);
