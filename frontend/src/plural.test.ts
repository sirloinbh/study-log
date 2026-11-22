import { expect, test } from 'vitest';

import { plural } from './plural';

test('plural puts the noun in the right number', () => {
  expect(plural(1, 'day')).toBe('1 day');
  expect(plural(0, 'day')).toBe('0 days');
  expect(plural(2, 'review')).toBe('2 reviews');
  expect(plural(1, 'study day')).toBe('1 study day');
  expect(plural(3, 'person', 'people')).toBe('3 people');
});
