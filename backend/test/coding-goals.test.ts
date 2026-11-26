import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { maxSheetRows } from '../src/coding-goal-import.js';
import type { Sheet } from '../src/coding-goals.js';
import { withApi } from './helpers.js';

// Bad requests are refused before any query reaches the database.
const untouchedPool = {
  query: async () => {
    throw new Error('DB must not be queried for invalid input');
  },
} as unknown as Pool;

const zip = Buffer.from([0x50, 0x4b, 3, 4, 0, 0]);
const header = ['문제 번호', '문제 제목'];
const sheets: Sheet[] = [
  { name: '문제목록', rows: [header, ['1000', 'A+B'], ['1001', 'A-B']] },
  {
    name: 'long',
    rows: [header, ...Array.from({ length: maxSheetRows + 1 }, (_, i) => [String(i + 1), 't'])],
  },
];
const reader = async () => sheets;

const form = (file: Buffer | undefined, fields: Record<string, string> = {}) => {
  const data = new FormData();
  if (file) data.append('file', new Blob([new Uint8Array(file)]), 'goals.xlsx');
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
};
const headers = { 'x-requested-with': 'study-log' };
const good = {
  sheet: '문제목록',
  name: 'Baekjoon 500',
  site: 'baekjoon',
  mapping: JSON.stringify({ key: 0, title: 1 }),
};

test('inspect lists the sheets with headers, a preview and the guessed columns', async () => {
  await withApi(
    untouchedPool,
    async (call) => {
      const { status, data } = await call('/api/coding/goals/inspect', {
        method: 'POST',
        form: form(zip),
        headers,
      });
      assert.equal(status, 200);
      const found = data.sheets as {
        name: string;
        mapping: unknown;
        rowCount: number;
        tooLong: boolean;
      }[];
      assert.equal(found[0].name, '문제목록');
      assert.equal(found[0].rowCount, 2);
      assert.deepEqual(found[0].mapping, { key: 0, title: 1 });
      assert.equal(found[1].tooLong, true);
    },
    { workbookReader: reader },
  );
});

test('a file that is missing, not a workbook, or unreadable is refused with a message', async () => {
  await withApi(
    untouchedPool,
    async (call) => {
      const none = await call('/api/coding/goals/inspect', {
        method: 'POST',
        form: form(undefined),
        headers,
      });
      assert.equal(none.status, 400);
      assert.match(String(none.data.error), /Send an \.xlsx file/);
      const text = await call('/api/coding/goals/inspect', {
        method: 'POST',
        form: form(Buffer.from('hello')),
        headers,
      });
      assert.equal(text.status, 400);
      assert.match(String(text.data.error), /not an \.xlsx workbook/);
    },
    {
      workbookReader: async () => {
        throw new Error('corrupt');
      },
    },
  );
  await withApi(
    untouchedPool,
    async (call) => {
      const broken = await call('/api/coding/goals/inspect', {
        method: 'POST',
        form: form(zip),
        headers,
      });
      assert.equal(broken.status, 400);
      assert.match(String(broken.data.error), /Could not read the workbook/);
    },
    {
      workbookReader: async () => {
        throw new Error('corrupt');
      },
    },
  );
});

test('a file over 2 MB is refused', async () => {
  await withApi(
    untouchedPool,
    async (call) => {
      const big = Buffer.concat([zip, Buffer.alloc(2 * 1024 * 1024)]);
      const { status, data } = await call('/api/coding/goals/inspect', {
        method: 'POST',
        form: form(big),
        headers,
      });
      assert.equal(status, 413);
      assert.match(String(data.error), /at most 2 MB/);
    },
    { workbookReader: reader },
  );
});

test('an import with wrong fields, a missing column choice or a long sheet is refused', async () => {
  const cases: [Record<string, string>, RegExp][] = [
    [{ ...good, name: ' ' }, /Enter the list name/],
    [{ ...good, site: 'gitlab' }, /The site must be/],
    [{ ...good, targetDate: '2026-02-30' }, /This date does not exist/],
    [{ ...good, mapping: 'nope' }, /column mapping format is invalid/],
    [{ ...good, mapping: JSON.stringify({ title: 1 }) }, /Choose the column/],
    [{ ...good, mapping: JSON.stringify({ key: -1 }) }, /column mapping format is invalid/],
    [{ ...good, sheet: 'missing' }, /no sheet with that name/],
    [{ ...good, sheet: 'long' }, /more than 2,000 rows/],
  ];
  await withApi(
    untouchedPool,
    async (call) => {
      for (const [fields, message] of cases) {
        const { status, data } = await call('/api/coding/goals/import', {
          method: 'POST',
          form: form(zip, fields),
          headers,
        });
        assert.equal(status, 400, JSON.stringify(fields));
        assert.match(String(data.error), message);
      }
      for (const path of [
        '/api/coding/goals/01',
        '/api/coding/goals/x',
        '/api/coding/goals/today?date=2026-02-30',
        '/api/coding/goals/today?date=tomorrow',
      ]) {
        const { status } = await call(path);
        assert.equal(status, 400, path);
      }
    },
    { workbookReader: reader },
  );
});
