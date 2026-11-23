import { describe, expect, test } from 'vitest';

import { ruleBody } from './test/style-rules';

describe('style rules', () => {
  // #394: the import buttons of the Coding screen are wider than a 390px phone when side by side.
  test('button rows wrap instead of widening the page', () => {
    expect(ruleBody('.actions')).toMatch(/flex-wrap/);
    expect(ruleBody('.log-actions')).toMatch(/flex-wrap/);
  });

  // #395: the check boxes of a schedule are 18px; the label around them is the 44px touch target.
  test('schedule day controls have a 44px touch target', () => {
    expect(ruleBody('.schedule-days .schedule-day-check')).toMatch(/min-h-11/);
    expect(ruleBody('.schedule-move .schedule-later')).toMatch(/min-h-11/);
  });
});
