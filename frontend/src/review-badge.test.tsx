import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router';
import { expect, test, vi } from 'vitest';

import { ReviewBadge } from './review-badge';

// Answers each count with the next value; the last one repeats.
function counts(...values: (number | 'fail')[]) {
  const fetch = vi.fn(() => {
    const value = values.length > 1 ? values.shift()! : values[0];
    return Promise.resolve(
      value === 'fail'
        ? new Response(JSON.stringify({ error: '오류' }), { status: 500 })
        : new Response(JSON.stringify({ count: value })),
    );
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

const page = (version = 0) => (
  <MemoryRouter>
    <Link to="/other">다른 화면</Link>
    <ReviewBadge to="/reviews" version={version} />
  </MemoryRouter>
);

const badge = (count: number) => screen.findByRole('link', { name: `오늘 복습 ${count}개` });

test('due reviews show a count that links to the reviews page', async () => {
  const fetch = counts(3);
  render(page());
  const link = await badge(3);
  expect(link).toHaveAttribute('href', '/reviews');
  expect(link).toHaveTextContent('3');
  expect(fetch).toHaveBeenCalledWith('/api/reviews/today/count', expect.anything());
});

test('nothing due shows no badge', async () => {
  const fetch = counts(0);
  render(page());
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  await act(async () => {});
  expect(screen.queryByRole('link', { name: /오늘 복습/ })).toBeNull();
});

test('a change a page reports counts again, down to no badge', async () => {
  counts(1, 0);
  const { rerender } = render(page(0));
  await badge(1);
  rerender(page(1));
  await waitFor(() => expect(screen.queryByRole('link', { name: /오늘 복습/ })).toBeNull());
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
  const fetch = counts(2, 'fail');
  const { rerender } = render(page(0));
  await badge(2);
  rerender(page(1));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  await act(async () => {});
  expect(await badge(2)).toBeInTheDocument();
});

test('a slow older answer does not overwrite a newer count', async () => {
  let answerOld = (_value: Response) => {};
  const old = new Promise<Response>((resolve) => (answerOld = resolve));
  const fetch = vi.fn(() =>
    fetch.mock.calls.length === 1
      ? old
      : Promise.resolve(new Response(JSON.stringify({ count: 5 }))),
  );
  vi.stubGlobal('fetch', fetch);
  const { rerender } = render(page(0));
  rerender(page(1));
  await badge(5);
  await act(async () => {
    answerOld(new Response(JSON.stringify({ count: 9 })));
    await old;
  });
  expect(await badge(5)).toBeInTheDocument();
});
