import assert from 'node:assert/strict';
import { test } from 'node:test';

import { chapterDays } from '../src/schedules.js';

test('the example of the rules: longer days hold more of the book', () => {
  // docs/decisions/schedule-rules.md 2장: boundaries at 5, 10, 15 and 20.
  assert.deepEqual(chapterDays([2, 2, 2, 2, 2, 5, 5], 4), [[0], [0], [0, 1], [1], [1], [2], [3]]);
});

test('landing exactly on a boundary starts the next chapter the next day', () => {
  assert.deepEqual(chapterDays([1, 1, 1, 1], 2), [[0], [0], [1], [1]]);
});

test('going past a boundary starts the next chapter the same day', () => {
  assert.deepEqual(chapterDays([3, 3], 3), [
    [0, 1],
    [1, 2],
  ]);
});

test('more chapters than days puts several on a day', () => {
  assert.deepEqual(chapterDays([60, 60], 6), [
    [0, 1, 2],
    [3, 4, 5],
  ]);
  assert.deepEqual(chapterDays([60], 3), [[0, 1, 2]]);
});

test('more days than chapters spreads one over them', () => {
  assert.deepEqual(chapterDays([60, 60, 60], 1), [[0], [0], [0]]);
});

test('whole numbers keep a boundary that fractions would miss', () => {
  // 10 ÷ 3 is not exact: chapter 1 ends at a running total of 4, chapter 2 at 7.
  assert.deepEqual(chapterDays([1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 3), [
    [0],
    [0],
    [0],
    [0, 1],
    [1],
    [1],
    [1, 2],
    [2],
    [2],
    [2],
  ]);
});

test('every chapter appears, in order, and the last ends on the last day', () => {
  for (const [targets, chapters] of [
    [[120, 300, 300, 120, 120, 45, 1440], 5],
    [[7, 11, 13], 17],
    [[1, 1440, 1], 2],
    [[5], 1],
    [[1, 2, 3, 4, 5, 6, 7, 8, 9], 4],
  ] as [number[], number][]) {
    const days = chapterDays(targets, chapters);
    const seen = [...new Set(days.flat())];
    assert.deepEqual(
      seen,
      Array.from({ length: chapters }, (_, index) => index),
    );
    assert.ok(days.flat().every((chapter, index, all) => index === 0 || chapter >= all[index - 1]));
    assert.equal(days.at(-1)?.at(-1), chapters - 1);
    assert.ok(days.every((chapters) => chapters.length > 0));
  }
});
