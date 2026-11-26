import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  guessMapping,
  mapRows,
  parseDay,
  parseLevel,
  parseStatus,
  problemFromUrl,
} from '../src/coding-goal-import.js';

const header = [
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
];

test('the header row of the sample file maps to its columns', () => {
  assert.deepEqual(guessMapping(header), {
    order: 0,
    group: 1,
    topic: 2,
    key: 3,
    title: 4,
    level: 5,
    url: 6,
    status: 7,
    solvedDate: 8,
    note: 9,
  });
});

test('the extra-problems sheet maps its own number column to the order, not the problem', () => {
  const mapping = guessMapping([
    '번호',
    '분야',
    '문제 번호',
    '문제 제목',
    '난이도',
    '맞힌 사람 수',
    '풀기 좋은 시점',
    '링크',
    '완료',
    '풀이 날짜',
    '메모',
  ]);
  assert.equal(mapping.order, 0);
  assert.equal(mapping.key, 2);
  assert.equal(mapping.title, 3);
  assert.equal(mapping.url, 7);
});

test('English headers are guessed too, and a column is used once', () => {
  assert.deepEqual(guessMapping(['Problem ID', 'Title', 'Tier', 'Topic']), {
    key: 0,
    title: 1,
    level: 2,
    topic: 3,
  });
  assert.deepEqual(guessMapping(['x', 'y']), {});
});

test('tiers in Korean and English become solved.ac levels', () => {
  assert.equal(parseLevel('브론즈 5'), 1);
  assert.equal(parseLevel('브론즈5'), 1);
  assert.equal(parseLevel('브론즈 1'), 5);
  assert.equal(parseLevel('실버 5'), 6);
  assert.equal(parseLevel('골드 3'), 13);
  assert.equal(parseLevel('플래티넘 1'), 20);
  assert.equal(parseLevel('Bronze V'), 1);
  assert.equal(parseLevel('Ruby I'), 30);
  assert.equal(parseLevel('Diamond IV'), 22);
  assert.equal(parseLevel('Unrated'), null);
  assert.equal(parseLevel('쉬움'), null);
  assert.equal(parseLevel(''), null);
});

test('links, dates and statuses are read strictly', () => {
  assert.deepEqual(problemFromUrl('https://www.acmicpc.net/problem/2557'), {
    site: 'baekjoon',
    problemKey: '2557',
  });
  assert.deepEqual(problemFromUrl('https://leetcode.com/problems/Two-Sum/description/'), {
    site: 'leetcode',
    problemKey: 'two-sum',
  });
  assert.equal(problemFromUrl('https://example.com/problem/1'), undefined);
  assert.equal(parseDay('2026-12-01'), '2026-12-01');
  assert.equal(parseDay('2026.1.5'), '2026-01-05');
  assert.equal(parseDay('2026-02-30'), undefined);
  assert.equal(parseDay('12/01/2026'), undefined);
  assert.equal(parseStatus('O'), 'solved');
  assert.equal(parseStatus('△'), 'partial');
  assert.equal(parseStatus('X'), undefined);
  assert.equal(parseStatus(''), undefined);
});

const mapping = guessMapping(header);

test('rows become items in order, with the tier, stage and topic', () => {
  const { items, skipped, blank } = mapRows(
    [
      header,
      [
        '1',
        '1단계',
        '입출력',
        '2557',
        'Hello World',
        '브론즈 5',
        'https://www.acmicpc.net/problem/2557',
        '',
        '',
        '',
      ],
      ['2', '1단계', '입출력', '1000.0', 'A+B', '브론즈 5', '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', ''],
    ],
    mapping,
    'baekjoon',
  );
  assert.equal(blank, 1);
  assert.deepEqual(skipped, []);
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], {
    site: 'baekjoon',
    problemKey: '2557',
    title: 'Hello World',
    group: '1단계',
    topic: '입출력',
    level: 1,
    targetDate: null,
    position: 1,
    attempt: null,
  });
  assert.equal(items[1].problemKey, '1000');
  assert.equal(items[1].position, 2);
});

test('bad rows are listed with their sheet row and the reason, not dropped silently', () => {
  const { items, skipped } = mapRows(
    [
      header,
      ['1', '', '', '2557', 'A', '', '', '', '', ''],
      ['2', '', '', 'abc', 'B', '', '', '', '', ''],
      ['3', '', '', '', 'C', '', '', '', '', ''],
      ['4', '', '', '2557', 'D', '', '', '', '', ''],
      ['5', '', '', '', 'E', '', 'https://example.com/x', '', '', ''],
    ],
    mapping,
    'baekjoon',
  );
  assert.equal(items.length, 1);
  assert.deepEqual(skipped, [
    { row: 3, reason: 'The problem number is not a Baekjoon number' },
    { row: 4, reason: 'No problem number or link' },
    { row: 5, reason: 'The same problem as row 2' },
    { row: 6, reason: 'The link is not a Baekjoon or LeetCode problem' },
  ]);
});

test('a missing title gets a made-up one and a target date must be a date', () => {
  const withDate = { ...mapping, targetDate: 10 };
  const { items, skipped } = mapRows(
    [
      [...header, '목표일'],
      ['1', '', '', '1000', '', '', '', '', '', '', '2026-12-31'],
      ['2', '', '', '1001', 'B', '', '', '', '', '', 'soon'],
    ],
    withDate,
    'baekjoon',
  );
  assert.equal(items[0].title, 'Baekjoon 1000');
  assert.equal(items[0].targetDate, '2026-12-31');
  assert.deepEqual(skipped, [{ row: 3, reason: 'The target date is not a date like 2026-12-01' }]);
});

test('only O and △ rows with a solve date carry an attempt; the note comes along', () => {
  const { items } = mapRows(
    [
      header,
      ['1', '', '', '1000', 'A', '', '', 'O', '2026-11-01', 'easy'],
      ['2', '', '', '1001', 'B', '', '', '△', '2026-11-02', ''],
      ['3', '', '', '1002', 'C', '', '', 'X', '2026-11-03', ''],
      ['4', '', '', '1003', 'D', '', '', 'O', '', ''],
      ['5', '', '', '1004', 'E', '', '', '', '2026-11-05', ''],
    ],
    mapping,
    'baekjoon',
  );
  assert.deepEqual(
    items.map((item) => item.attempt),
    [
      { result: 'solved', date: '2026-11-01', notes: 'easy' },
      { result: 'partial', date: '2026-11-02', notes: '' },
      null,
      null,
      null,
    ],
  );
});

test('a LeetCode list takes slugs, and a link overrides the list site', () => {
  const { items, skipped } = mapRows(
    [
      ['id', 'link'],
      ['Two-Sum', ''],
      ['', 'https://www.acmicpc.net/problem/1000'],
      ['two sum', ''],
    ],
    { key: 0, url: 1 },
    'leetcode',
  );
  assert.deepEqual(
    items.map((item) => [item.site, item.problemKey, item.title]),
    [
      ['leetcode', 'two-sum', 'LeetCode two-sum'],
      ['baekjoon', '1000', 'Baekjoon 1000'],
    ],
  );
  assert.equal(skipped.length, 1);
});
