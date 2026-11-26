import assert from 'node:assert/strict';
import { test } from 'node:test';

import { streakOf } from '../src/coding-summary.js';

test('the streak counts the days in a row ending today', () => {
  assert.equal(streakOf(['2026-11-26', '2026-11-25', '2026-11-24'], '2026-11-26'), 3);
});

test('the streak is kept while today has no attempt yet', () => {
  assert.equal(streakOf(['2026-11-25', '2026-11-24'], '2026-11-26'), 2);
});

test('a missed day ends the streak, and an old run does not count', () => {
  assert.equal(streakOf(['2026-11-26', '2026-11-24', '2026-11-23'], '2026-11-26'), 1);
  assert.equal(streakOf(['2026-11-20', '2026-11-19'], '2026-11-26'), 0);
  assert.equal(streakOf([], '2026-11-26'), 0);
});

test('the streak crosses a month and year end', () => {
  assert.equal(streakOf(['2027-01-01', '2026-12-31', '2026-12-30'], '2027-01-01'), 3);
});
