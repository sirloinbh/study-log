import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router';
import { expect, test } from 'vitest';

import { ReviewBadge } from './review-badge';
import { fakeApi } from './test/fake-api';

// Answers each count with the next value; the last one repeats.
function counts(...values: (number | 'fail')[]) {
  return fakeApi({
    'GET /api/reviews/today/count': () => {
      const value = values.length > 1 ? values.shift()! : values[0];
      return value === 'fail'
        ? { status: 500, body: { error: 'Error' } }
        : { body: { count: value } };
    },
  });
}

const page = (version = 0) => (
  <MemoryRouter>
    <Link to="/other">다른 화면</Link>
    <ReviewBadge to="/reviews" version={version} />
  </MemoryRouter>
);

const badge = (count: number) =>
  screen.findByRole('link', { name: `${count} ${count === 1 ? 'review' : 'reviews'} today` });

test('due reviews show a count that links to the reviews page', async () => {
  const api = counts(3);
  render(page());
  const link = await badge(3);
  expect(link).toHaveAttribute('href', '/reviews');
  expect(link).toHaveTextContent('3');
  expect(api.requests.map((r) => r.path)).toEqual(['/api/reviews/today/count']);
});

test('nothing due shows no badge', async () => {
  const api = counts(0);
  render(page());
  await api.requested((r) => r.path === '/api/reviews/today/count');
  await act(async () => {});
  expect(screen.queryByRole('link', { name: /reviews today/ })).toBeNull();
});

test('a change a page reports counts again, down to no badge', async () => {
  counts(1, 0);
  const { rerender } = render(page(0));
  await badge(1);
  rerender(page(1));
  await waitFor(() => expect(screen.queryByRole('link', { name: /reviews today/ })).toBeNull());
});

test('moving to another page counts again', async () => {
  counts(1, 2);
  render(page());
  await badge(1);
  fireEvent.click(screen.getByRole('link', { name: '다른 화면' }));
  await badge(2);
});

test('returning to the tab counts again', async () => {
  counts(1, 4);
  render(page());
  await badge(1);
  fireEvent.focus(window);
  await badge(4);
});

test('a failed count keeps the last one', async () => {
  const api = counts(2, 'fail');
  const { rerender } = render(page(0));
  await badge(2);
  rerender(page(1));
  await waitFor(() => expect(api.requests).toHaveLength(2));
  await act(async () => {});
  expect(await badge(2)).toBeInTheDocument();
});

test('a slow older answer does not overwrite a newer count', async () => {
  let answerOld = () => {};
  const old = new Promise<void>((resolve) => (answerOld = resolve));
  let asked = 0;
  fakeApi({
    'GET /api/reviews/today/count': () =>
      ++asked === 1 ? { hold: old, body: { count: 9 } } : { body: { count: 5 } },
  });
  const { rerender } = render(page(0));
  rerender(page(1));
  await badge(5);
  await act(async () => {
    answerOld();
    await old;
  });
  expect(await badge(5)).toBeInTheDocument();
});
