import { describe, expect, test } from 'vitest';

import { ruleBody } from './test/style-rules';

describe('style rules', () => {
  // #394: the import buttons of the Coding screen are wider than a 390px phone when side by side.
  test('button rows wrap instead of widening the page', () => {
    expect(ruleBody('.actions')).toMatch(/flex-wrap/);
    expect(ruleBody('.log-actions')).toMatch(/flex-wrap/);
  });
});
