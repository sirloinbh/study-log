import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import type { Sheet } from '../src/coding-goals.js';
import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;
type Json = Record<string, unknown>;

const listName = 'zz goal import test';
const keys = ['zz-goal-a', 'zz-goal-b', 'zz-goal-c', 'zz-goal-d'];
const header = ['id', 'title', 'done', 'date', 'memo'];
let rows: string[][] = [];
const sheets = (): Sheet[] => [{ name: 'list', rows: [header, ...rows] }];
const zip = Buffer.from([0x50, 0x4b, 3, 4, 0, 0]);
const headers = { 'x-requested-with': 'study-log' };
const fields = (extra: Record<string, string> = {}) => {
  const data = new FormData();
  data.append('file', new Blob([new Uint8Array(zip)]), 'goals.xlsx');
  const base = {
    sheet: 'list',
    name: listName,
    site: 'other',
    mapping: JSON.stringify({ key: 0, title: 1, status: 2, solvedDate: 3, note: 4 }),
    ...extra,
  };
  for (const [key, value] of Object.entries(base)) data.append(key, value);
  return data;
};

// Requires a dedicated test DB with database/migrations applied. Skipped (not passed) without it.
test(
  'a goal list is imported once, a re-import changes nothing, and progress becomes attempts only the first time',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    const cleanup = async () => {
      await pool.query(`DELETE FROM coding_goal_lists WHERE name = $1`, [listName]);
      await pool.query(`DELETE FROM coding_problems WHERE problem_key = ANY($1)`, [keys]);
    };
    await cleanup();
    t.after(async () => {
      await cleanup();
      await pool.end();
    });
    // One problem is in the problem log already.
    await pool.query(
      `INSERT INTO coding_problems (site, problem_key, title) VALUES ('other', $1, 'Logged B')`,
      [keys[1]],
    );
    rows = [
      [keys[0], 'Problem A', 'O', '2097-06-01', 'easy'],
      [keys[1], 'Problem B', '△', '2097-06-02', ''],
      [keys[2], 'Problem C', 'X', '2097-06-03', ''],
      ['', 'No key', '', '', ''],
      [keys[0], 'Again A', '', '', ''],
    ];
    await withApi(
      pool,
      async (call) => {
        const dry = await call('/api/coding/goals/import', {
          method: 'POST',
          form: fields({ dryRun: '1' }),
          headers,
        });
        assert.equal(dry.status, 200);
        const preview = dry.data.plan as Json;
        assert.equal(preview.willAdd, 3);
        assert.equal(preview.alreadyLogged, 1);
        assert.equal(preview.attemptsToAdd, 2);
        assert.equal((preview.skipped as unknown[]).length, 2);
        assert.deepEqual((await call('/api/coding/goals')).data.lists, []);

        const first = await call('/api/coding/goals/import', {
          method: 'POST',
          form: fields(),
          headers,
        });
        assert.equal(first.status, 201);
        const id = first.data.id as number;
        const detail = await call(`/api/coding/goals/${id}`);
        const items = detail.data.items as Json[];
        assert.deepEqual(
          items.map((item) => item.problemKey),
          [keys[0], keys[1], keys[2]],
        );
        assert.equal(items[1].problemId !== null, true);
        const problems = await call('/api/coding/problems?q=zz-goal');
        const byKey = new Map(
          (problems.data.problems as Json[]).map((p) => [p.problemKey, p] as const),
        );
        assert.equal(byKey.get(keys[0])?.lastResult, 'solved');
        assert.equal(byKey.get(keys[1])?.lastResult, 'partial');
        assert.equal(byKey.has(keys[2]), false);

        const again = await call('/api/coding/goals/import', {
          method: 'POST',
          form: fields(),
          headers,
        });
        assert.equal(again.status, 200);
        const repeat = again.data.plan as Json;
        assert.equal(repeat.willAdd, 0);
        assert.equal(repeat.willUpdate, 0);
        assert.equal(repeat.unchanged, 3);
        assert.equal(repeat.attemptsToAdd, 0);
        const after = await call('/api/coding/problems?q=zz-goal');
        assert.equal(
          (after.data.problems as Json[]).reduce((sum, p) => sum + (p.attemptCount as number), 0),
          2,
        );

        // A changed title updates the item, and a problem left out of the file stays.
        rows = [
          [keys[0], 'Problem A (new title)', '', '', ''],
          [keys[3], 'Problem D', '', '', ''],
        ];
        const changed = await call('/api/coding/goals/import', {
          method: 'POST',
          form: fields(),
          headers,
        });
        const plan = changed.data.plan as Json;
        assert.equal(plan.willAdd, 1);
        assert.equal(plan.willUpdate, 1);
        assert.equal(plan.notInFile, 2);
        const list = (await call('/api/coding/goals')).data.lists as Json[];
        assert.equal(list.length, 1);
        assert.equal(list[0].total, 4);
        const audit = await pool.query(
          `SELECT count(*)::int AS count FROM audit_log WHERE entity = 'coding_goal_list' AND entity_id = $1`,
          [String(id)],
        );
        assert.equal(audit.rows[0].count, 2);

        assert.equal((await call(`/api/coding/goals/${id}`, { method: 'DELETE' })).status, 204);
        assert.equal((await call(`/api/coding/goals/${id}`)).status, 404);
      },
      { workbookReader: async () => sheets() },
    );
  },
);

test(
  'progress counts solved, late and due items, and the day block lists what was planned and solved',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    const name = 'zz goal progress test';
    const cleanup = async () => {
      await pool.query(`DELETE FROM coding_goal_lists WHERE name = $1`, [name]);
      await pool.query(`DELETE FROM coding_problems WHERE problem_key = ANY($1)`, [keys]);
    };
    await cleanup();
    t.after(async () => {
      await cleanup();
      await pool.end();
    });
    // C was solved long before the list exists; D failed once, which does not make it solved.
    const logged = await pool.query<{ id: number }>(
      `INSERT INTO coding_problems (site, problem_key, title) VALUES ('other', $1, 'Logged C') RETURNING id`,
      [keys[2]],
    );
    await pool.query(
      `INSERT INTO coding_attempts (problem_id, attempt_date, result) VALUES ($1, '2097-01-02', 'solved')`,
      [logged.rows[0].id],
    );
    const failed = await pool.query<{ id: number }>(
      `INSERT INTO coding_problems (site, problem_key, title) VALUES ('other', $1, 'Logged D') RETURNING id`,
      [keys[3]],
    );
    await pool.query(
      `INSERT INTO coding_attempts (problem_id, attempt_date, result) VALUES ($1, '2097-06-01', 'failed')`,
      [failed.rows[0].id],
    );
    rows = [
      [keys[0], 'Problem A', 'O', '2097-06-01', ''],
      [keys[1], 'Problem B', '', '', ''],
      [keys[2], 'Problem C', '', '', ''],
      [keys[3], 'Problem D', '', '', ''],
    ];
    await withApi(
      pool,
      async (call) => {
        const imported = await call('/api/coding/goals/import', {
          method: 'POST',
          form: fields({ name, targetDate: '2097-06-05' }),
          headers,
        });
        assert.equal(imported.status, 201);
        const id = imported.data.id as number;

        const detail = await call(`/api/coding/goals/${id}`);
        const items = detail.data.items as Json[];
        const state = (key: string) => items.find((item) => item.problemKey === key)?.state;
        assert.equal(state(keys[0]), 'solved');
        assert.equal(state(keys[1]), 'late');
        assert.equal(state(keys[2]), 'solved');
        assert.equal(state(keys[3]), 'late');
        assert.equal(items.find((item) => item.problemKey === keys[2])?.solvedDate, '2097-01-02');
        assert.equal(items.find((item) => item.problemKey === keys[3])?.attemptCount, 1);
        assert.deepEqual(detail.data.progress, {
          total: 4,
          solved: 2,
          late: 2,
          weekPlanned: 0,
          weekSolved: 0,
        });

        const lists = (await call('/api/coding/goals')).data.lists as Json[];
        const own = lists.find((list) => list.id === id);
        assert.equal(own?.solved, 2);
        assert.deepEqual(
          (own?.next as Json[]).map((item) => item.problemKey),
          [keys[1], keys[3]],
        );

        // The due day: the list's target date is each item's due day.
        const due = (await call('/api/coding/goals/today?date=2097-06-05')).data.lists as Json[];
        assert.equal((due.find((list) => list.id === id)?.planned as Json[]).length, 4);
        const solvedDay = (await call('/api/coding/goals/today?date=2097-06-01')).data
          .lists as Json[];
        assert.deepEqual(
          (solvedDay.find((list) => list.id === id)?.solved as Json[]).map(
            (item) => item.problemKey,
          ),
          [keys[0]],
        );
      },
      { today: () => '2097-06-10', workbookReader: async () => sheets() },
    );
  },
);
