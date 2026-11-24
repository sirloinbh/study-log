import assert from 'node:assert/strict';
import { test } from 'node:test';

import { nextExerciseReview, replayExerciseReview } from '../src/exercise-reviews.js';

const attempt = (result: 'correct' | 'wrong', hintUsed = false, date = '2026-11-10') => ({
  date,
  result,
  hintUsed,
});

test('a wrong or hinted attempt starts the cycle at step 1, due the next day (#358)', () => {
  const due = { action: 'set', step: 1, dueDate: '2026-11-11' };
  assert.deepEqual(nextExerciseReview(undefined, attempt('wrong')), due);
  assert.deepEqual(nextExerciseReview(undefined, attempt('correct', true)), due);
  assert.deepEqual(nextExerciseReview(undefined, attempt('wrong', true)), due);
});

test('a clean correct attempt moves to the next step, 3, 7 then 14 days out (#358)', () => {
  assert.deepEqual(nextExerciseReview({ step: 1 }, attempt('correct')), {
    action: 'set',
    step: 2,
    dueDate: '2026-11-13',
  });
  assert.deepEqual(nextExerciseReview({ step: 2 }, attempt('correct')), {
    action: 'set',
    step: 3,
    dueDate: '2026-11-17',
  });
  assert.deepEqual(nextExerciseReview({ step: 3 }, attempt('correct')), {
    action: 'set',
    step: 4,
    dueDate: '2026-11-24',
  });
});

test('finishing step 4 ends the cycle, and a clean correct attempt alone starts nothing (#358)', () => {
  assert.deepEqual(nextExerciseReview({ step: 4 }, attempt('correct')), { action: 'end' });
  assert.deepEqual(nextExerciseReview(undefined, attempt('correct')), { action: 'none' });
});

test('a wrong or hinted retry restarts at step 1 from any step (#358)', () => {
  for (const step of [1, 2, 3, 4]) {
    assert.deepEqual(nextExerciseReview({ step }, attempt('wrong', false, '2026-12-31')), {
      action: 'set',
      step: 1,
      dueDate: '2027-01-01',
    });
    assert.equal(nextExerciseReview({ step }, attempt('correct', true)).action, 'set');
  }
});

test('replaying the attempts gives the review the history leads to (#393)', () => {
  assert.equal(replayExerciseReview([]), undefined);
  assert.equal(replayExerciseReview([attempt('correct')]), undefined);
  assert.deepEqual(replayExerciseReview([attempt('wrong', false, '2026-11-10')]), {
    step: 1,
    dueDate: '2026-11-11',
  });
  // A wrong try, then a clean one: step 2.
  assert.deepEqual(
    replayExerciseReview([
      attempt('wrong', false, '2026-11-10'),
      attempt('correct', false, '2026-11-11'),
    ]),
    { step: 2, dueDate: '2026-11-14' },
  );
  // Four clean tries after a wrong one end the cycle.
  assert.equal(
    replayExerciseReview([
      attempt('wrong', false, '2026-11-10'),
      ...['2026-11-11', '2026-11-14', '2026-11-21', '2026-12-05'].map((d) =>
        attempt('correct', false, d),
      ),
    ]),
    undefined,
  );
});
