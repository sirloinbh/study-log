import assert from 'node:assert/strict';
import { test } from 'node:test';

import { progressOf, stateOf } from '../src/coding-goal-progress.js';

const item = (solvedDate: string | null, dueDate: string | null) => ({ solvedDate, dueDate });

test('an item is solved by any solved attempt, late only when unsolved and past due', () => {
  assert.equal(stateOf(item('2026-11-01', null), '2026-11-26'), 'solved');
  // Solved after the due day is still solved.
  assert.equal(stateOf(item('2026-12-05', '2026-12-01'), '2026-12-10'), 'solved');
  assert.equal(stateOf(item(null, '2026-11-25'), '2026-11-26'), 'late');
  assert.equal(stateOf(item(null, '2026-11-26'), '2026-11-26'), 'left');
  assert.equal(stateOf(item(null, '2026-11-27'), '2026-11-26'), 'left');
  assert.equal(stateOf(item(null, null), '2026-11-26'), 'left');
});

test('progress counts solved, late and what is due this week (Sunday to Saturday)', () => {
  // 2026-11-26 is a Thursday: the week is 2026-11-22 to 2026-11-28.
  const progress = progressOf(
    [
      // Solved before the list was imported, no due day.
      item('2026-09-01', null),
      item('2026-11-24', '2026-11-24'),
      item(null, '2026-11-23'),
      item(null, '2026-11-28'),
      item(null, '2026-11-29'),
      item(null, '2026-11-21'),
      item(null, null),
    ],
    '2026-11-26',
  );
  assert.deepEqual(progress, {
    total: 7,
    solved: 2,
    late: 2,
    weekPlanned: 3,
    weekSolved: 1,
  });
});

test('an empty list has zero progress', () => {
  assert.deepEqual(progressOf([], '2026-11-26'), {
    total: 0,
    solved: 0,
    late: 0,
    weekPlanned: 0,
    weekSolved: 0,
  });
});
