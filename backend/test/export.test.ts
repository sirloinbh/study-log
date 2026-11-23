import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { csvCell, exercisesMarkdown, retrospectivesMarkdown, toCsv } from '../src/export.js';
import { withApi } from './helpers.js';

const bom = String.fromCharCode(0xfeff);

test('a CSV cell is quoted for commas, quotes and line breaks, and formulas are defused', () => {
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(90), '90');
  assert.equal(csvCell(true), 'true');
  assert.equal(csvCell('plain 고유값'), 'plain 고유값');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('line 1\nline 2'), '"line 1\nline 2"');
  assert.equal(csvCell('line 1\r\nline 2'), '"line 1\r\nline 2"');
  // Spreadsheets would run these; a leading apostrophe keeps them text.
  assert.equal(csvCell('=SUM(A1:A2)'), "'=SUM(A1:A2)");
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('@cmd'), "'@cmd");
  assert.equal(csvCell('-2+3'), "'-2+3");
  // A Markdown list item is not a formula.
  assert.equal(csvCell('- first'), '- first');
});

test('a CSV starts with a byte order mark and ends every row with CRLF', () => {
  const csv = toCsv(
    ['id', 'memo'],
    [
      [1, 'a,b\nc'],
      [2, ''],
    ],
  );
  assert.equal(csv, `${bom}id,memo\r\n1,"a,b\nc"\r\n2,\r\n`);
});

test('exercises are grouped by textbook and chapter with their answers', () => {
  const markdown = exercisesMarkdown([
    {
      textbook: 'Linear algebra',
      chapter: '1 Vectors',
      number: '1',
      body: 'Find u.',
      important: true,
      answer: 'u = 2',
    },
    {
      textbook: 'Linear algebra',
      chapter: '1 Vectors',
      number: '',
      body: 'Prove it.',
      important: false,
      answer: null,
    },
    {
      textbook: 'Linear algebra',
      chapter: '2 Matrices',
      number: '3',
      body: 'Invert A.',
      important: false,
      answer: null,
    },
    {
      textbook: 'Calculus',
      chapter: '1 Limits',
      number: '1',
      body: 'Limit?',
      important: false,
      answer: null,
    },
  ]);
  assert.equal(
    markdown,
    [
      '# Exercises',
      '',
      '## Linear algebra',
      '',
      '### 1 Vectors',
      '',
      '#### Problem 1 (important)',
      '',
      'Find u.',
      '',
      '**Answer**',
      '',
      'u = 2',
      '',
      '#### Problem (no number)',
      '',
      'Prove it.',
      '',
      '### 2 Matrices',
      '',
      '#### Problem 3',
      '',
      'Invert A.',
      '',
      '## Calculus',
      '',
      '### 1 Limits',
      '',
      '#### Problem 1',
      '',
      'Limit?',
      '',
    ].join('\n'),
  );
});

test('retrospectives list each period with its text', () => {
  assert.equal(
    retrospectivesMarkdown([
      { kind: 'weekly', from: '2026-11-15', to: '2026-11-21', body: 'Went fine' },
      { kind: 'monthly', from: '2026-11-01', to: '2026-11-30', body: 'Good month' },
    ]),
    [
      '# Retrospectives',
      '',
      '## Weekly 2026-11-15 to 2026-11-21',
      '',
      'Went fine',
      '',
      '## Monthly 2026-11-01 to 2026-11-30',
      '',
      'Good month',
      '',
    ].join('\n'),
  );
});

test('exports are downloads with the right headers, and the range is passed to the query', async () => {
  const queries: { text: string; values?: unknown[] }[] = [];
  const pool = {
    query: async (text: string, values?: unknown[]) => {
      queries.push({ text, values });
      return { rows: [{ id: 1, date: '2026-11-22', memo: 'a,b' }], rowCount: 1 };
    },
  } as unknown as Pool;
  await withApi(
    pool,
    async (call) => {
      const csv = await call('/api/export/study-logs.csv?from=2026-11-01&to=2026-11-30');
      assert.equal(csv.status, 200);
      assert.equal(csv.headers.get('content-type'), 'text/csv; charset=utf-8');
      assert.equal(
        csv.headers.get('content-disposition'),
        'attachment; filename="study-logs-2026-11-23.csv"',
      );
      assert.equal(csv.headers.get('cache-control'), 'private, no-store');
      assert.equal(csv.headers.get('x-content-type-options'), 'nosniff');
      assert.ok(csv.bytes.toString().startsWith(`${bom}id,date,start,end,minutes`));
      assert.match(csv.bytes.toString(), /\r\n1,2026-11-22,,,,,,,,,,,,"a,b"\r\n$/);
      assert.deepEqual(queries[0].values, ['2026-11-01', '2026-11-30']);
      assert.match(queries[0].text, /l\.study_date >= \$1 AND l\.study_date <= \$2/);

      queries.length = 0;
      const all = await call('/api/export/retrospectives.md');
      assert.equal(all.status, 200);
      assert.equal(all.headers.get('content-type'), 'text/markdown; charset=utf-8');
      assert.equal(
        all.headers.get('content-disposition'),
        'attachment; filename="retrospectives-2026-11-23.md"',
      );
      assert.deepEqual(queries[0].values, []);
      assert.doesNotMatch(queries[0].text, /WHERE/);

      queries.length = 0;
      const exercises = await call('/api/export/exercises.md?from=2026-11-05');
      assert.equal(exercises.status, 200);
      assert.deepEqual(queries[0].values, ['2026-11-05']);
      assert.match(queries[0].text, /Asia\/Seoul/);
    },
    { today: () => '2026-11-23' },
  );
});

test('a bad range is refused before the database is asked', async () => {
  const pool = {
    query: async () => {
      throw new Error('DB must not be queried for invalid input');
    },
  } as unknown as Pool;
  await withApi(pool, async (call) => {
    for (const path of ['study-logs.csv', 'exercises.md', 'retrospectives.md']) {
      const bad = await call(`/api/export/${path}?from=2026/11/01`);
      assert.equal(bad.status, 400);
      assert.match(String(bad.data.error), /The date must be in YYYY-MM-DD format/);
      const order = await call(`/api/export/${path}?from=2026-11-30&to=2026-11-01`);
      assert.equal(order.status, 400);
      assert.match(String(order.data.error), /The start date cannot be after the end date/);
    }
  });
});
