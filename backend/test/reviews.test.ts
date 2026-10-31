import assert from 'node:assert/strict';
import { test } from 'node:test';

import { reviewDueDate, reviewGaps } from '../src/reviews.js';

test('reviewing on time lands 1, 3, 7, 14 and 30 days after studying', () => {
  let done = '2026-10-31';
  const dates = ([1, 2, 3, 4, 5] as const).map((round) => (done = reviewDueDate(done, round)));
  assert.deepEqual(dates, ['2026-11-01', '2026-11-03', '2026-11-07', '2026-11-14', '2026-11-30']);
  assert.equal(
    reviewGaps.reduce((sum, gap) => sum + gap, 0),
    30,
  );
});

test('a late completion moves the next round by counting from the completion', () => {
  assert.equal(reviewDueDate('2026-11-10', 2), '2026-11-12');
});

test('due dates cross months, years and leap days', () => {
  assert.equal(reviewDueDate('2026-12-31', 1), '2027-01-01');
  assert.equal(reviewDueDate('2028-02-28', 1), '2028-02-29');
  assert.equal(reviewDueDate('2027-02-28', 1), '2027-03-01');
});

test('a due date past the last accepted date stays on it', () => {
  assert.equal(reviewDueDate('9999-12-31', 1), '9999-12-31');
  assert.equal(reviewDueDate('9999-12-20', 5), '9999-12-31');
  assert.equal(reviewDueDate('9999-12-30', 1), '9999-12-31');
});
