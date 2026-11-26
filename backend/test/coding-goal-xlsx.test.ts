import assert from 'node:assert/strict';
import { test } from 'node:test';

import ExcelJS from 'exceljs';

import { guessMapping, mapRows } from '../src/coding-goal-import.js';
import { cellText, readWorkbook } from '../src/coding-goal-xlsx.js';

async function workbook(build: (book: ExcelJS.Workbook) => void) {
  const book = new ExcelJS.Workbook();
  build(book);
  return Buffer.from(await book.xlsx.writeBuffer());
}

test('every sheet is read as rows of text, with numbers, dates, formulas and rich text flattened', async () => {
  const file = await workbook((book) => {
    const list = book.addWorksheet('문제목록');
    list.addRow(['순서', '문제 번호', '문제 제목', '난이도', '풀이 날짜', '메모']);
    list.addRow([1, 2557, 'Hello World', '브론즈 5', new Date(Date.UTC(2026, 10, 3)), 'ok']);
    list.addRow([2, 1000, { richText: [{ text: 'A' }, { text: '+B' }] }, '브론즈 5']);
    list.getCell('F3').value = { formula: 'A3*2', result: 4 };
    list.getRow(5).getCell(2).value = 1001;
    book.addWorksheet('단계별요약').addRow(['x']);
  });
  const sheets = await readWorkbook(file);
  assert.deepEqual(
    sheets.map((sheet) => sheet.name),
    ['문제목록', '단계별요약'],
  );
  const rows = sheets[0].rows;
  assert.deepEqual(rows[0], ['순서', '문제 번호', '문제 제목', '난이도', '풀이 날짜', '메모']);
  assert.deepEqual(rows[1], ['1', '2557', 'Hello World', '브론즈 5', '2026-11-03', 'ok']);
  assert.deepEqual(rows[2], ['2', '1000', 'A+B', '브론즈 5', '', '4']);
  // The empty row 4 keeps its place, so a row keeps its sheet number.
  assert.deepEqual(rows[3], []);
  assert.deepEqual(rows[4], ['', '1001']);
});

test('a read sheet maps to items like the sample file', async () => {
  const file = await workbook((book) => {
    const list = book.addWorksheet('문제목록');
    list.addRow([
      '순서',
      '단계',
      '분야',
      '문제 번호',
      '문제 제목',
      '난이도',
      '링크',
      '완료',
      '풀이 날짜',
      '메모',
    ]);
    list.addRow([
      1,
      '1단계',
      '입출력',
      2557,
      'Hello World',
      '브론즈 5',
      'https://www.acmicpc.net/problem/2557',
      'O',
      '2026-11-03',
      '',
    ]);
  });
  const [sheet] = await readWorkbook(file);
  const mapped = mapRows(sheet.rows, guessMapping(sheet.rows[0]), 'baekjoon');
  assert.equal(mapped.skipped.length, 0);
  assert.equal(mapped.items[0].problemKey, '2557');
  assert.deepEqual(mapped.items[0].attempt, { result: 'solved', date: '2026-11-03', notes: '' });
});

test('cell values of every kind give text, and errors give nothing', () => {
  assert.equal(cellText(null), '');
  assert.equal(cellText(12), '12');
  assert.equal(cellText(true), 'true');
  assert.equal(cellText({ error: '#N/A' }), '');
  assert.equal(cellText({ text: 'link', hyperlink: 'https://x.test' }), 'link');
});
