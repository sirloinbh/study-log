import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { expect, test, vi } from 'vitest';

import { overdueDays, type Review, reviewTitle } from './review';
import { Reviews } from './reviews';

const today = '2026-10-31';

const review = (over: Partial<Review> = {}): Review => ({
  id: 1,
  round: 1,
  dueDate: today,
  studyDate: '2026-10-30',
  memo: '고유값 정리',
  textbookTitle: null,
  contentNumber: null,
  contentTitle: null,
  ...over,
});

// Answers GET with the list, which `completeAnswer` changes. The latest list is read per request.
function server(
  initial: Review[],
  completeAnswer: (rows: Review[], id: number) => { status: number; body: object },
) {
  let rows = initial;
  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fetch = vi.fn((url: string, init?: { method?: string }) => {
    if (init?.method === 'POST') {
      const id = Number(url.split('/')[3]);
      const answer = completeAnswer(rows, id);
      if (answer.status < 400) rows = rows.filter((row) => row.id !== id);
      return Promise.resolve(json(answer.body, answer.status));
    }
    return Promise.resolve(json({ today, reviews: rows }));
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

const done = (next: object | null) => () => ({ status: 200, body: { next } });

// A page whose only review has gone elsewhere: completing it fails and the reload no longer has it.
function ReviewsWithGone({ status, error }: { status: number; error: string }) {
  const [ready] = useState(() => {
    let gone = false;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: { method?: string }) => {
        if (init?.method === 'POST') {
          gone = true;
          return Promise.resolve(new Response(JSON.stringify({ error }), { status }));
        }
        return Promise.resolve(
          new Response(JSON.stringify({ today, reviews: gone ? [] : [review()] })),
        );
      }),
    );
    return true;
  });
  return ready ? <Reviews /> : null;
}

test('days overdue count whole days and never go below zero', () => {
  expect(overdueDays('2026-10-31', today)).toBe(0);
  expect(overdueDays('2026-10-28', today)).toBe(3);
  expect(overdueDays('2026-11-02', today)).toBe(0);
  expect(overdueDays('2024-02-28', '2024-03-01')).toBe(2);
});

test('the title names the textbook and chapter, or else the date', () => {
  const book = { textbookTitle: '선형대수' };
  expect(reviewTitle(review(book))).toBe('선형대수');
  expect(reviewTitle(review({ ...book, contentNumber: '2', contentTitle: '행렬' }))).toBe(
    '선형대수 · 2 행렬',
  );
  expect(reviewTitle(review({ ...book, contentNumber: '', contentTitle: '행렬' }))).toBe(
    '선형대수 · 행렬',
  );
  expect(reviewTitle(review())).toBe('2026-10-30 학습');
});

test('the memo is shown as Markdown, and a blank memo not at all', async () => {
  server(
    [review({ id: 1, memo: '**정의**를 다시 푼다' }), review({ id: 2, memo: '  ' })],
    done(null),
  );
  render(<Reviews />);
  const bold = await screen.findByText('정의');
  expect(bold.tagName).toBe('STRONG');
  expect(document.querySelectorAll('.memo')).toHaveLength(1);
});

test('an empty list says there is nothing to review', async () => {
  server([], done(null));
  render(<Reviews />);
  expect(await screen.findByText('오늘 복습할 내용이 없습니다')).toBeInTheDocument();
});

test('overdue reviews stay listed and say how late they are', async () => {
  server(
    [
      review({ id: 1, dueDate: '2026-10-28', round: 2, memo: '지난 복습' }),
      review({ id: 2, memo: '오늘 복습' }),
    ],
    done(null),
  );
  render(<Reviews />);
  expect(await screen.findByText('3일 지남')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '오늘의 복습 2개' })).toBeInTheDocument();
  expect(screen.getByText('2회차')).toBeInTheDocument();
  expect(screen.getAllByText(/일 지남/)).toHaveLength(1);
});

test('completing removes the review, shows the next date and moves focus', async () => {
  const fetch = server([review()], done({ round: 2, dueDate: '2026-11-02' }));
  render(<Reviews />);
  fireEvent.click(await screen.findByRole('button', { name: '2026-10-30 학습 1회차 복습 완료' }));
  expect(
    await screen.findByText('복습을 완료했습니다. 다음 복습은 2026-11-02입니다'),
  ).toBeInTheDocument();
  expect(await screen.findByText('오늘 복습할 내용이 없습니다')).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledWith(
    '/api/reviews/1/complete',
    expect.objectContaining({ method: 'POST' }),
  );
  await waitFor(() => expect(document.activeElement?.id).toBe('reviews-today'));
});

test('completing the last round says the reviews are finished', async () => {
  server([review({ round: 5 })], done(null));
  render(<Reviews />);
  fireEvent.click(await screen.findByRole('button', { name: /5회차 복습 완료/ }));
  expect(
    await screen.findByText('복습을 완료했습니다. 이 기록의 복습을 모두 마쳤습니다'),
  ).toBeInTheDocument();
});

test('a failed completion keeps the review, reports it and returns focus to its button', async () => {
  server([review()], () => ({ status: 500, body: { error: '서버 오류가 발생했습니다' } }));
  render(<Reviews />);
  const button = await screen.findByRole('button', { name: /복습 완료/ });
  fireEvent.click(button);
  expect(await screen.findByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /복습 완료/ })),
  );
});

test('a review already completed elsewhere leaves the list and focus goes to the heading', async () => {
  for (const [status, error] of [
    [409, '이미 완료한 복습입니다'],
    [404, '복습을 찾을 수 없습니다'],
  ] as const) {
    const { unmount } = render(<ReviewsWithGone status={status} error={error} />);
    fireEvent.click(await screen.findByRole('button', { name: /복습 완료/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(error);
    expect(await screen.findByText('오늘 복습할 내용이 없습니다')).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement?.id).toBe('reviews-today'));
    unmount();
  }
});

test('focus goes to the heading when a failed review is gone after the reload', async () => {
  // A 500 whose completion did commit: the review is not listed when the page reloads.
  let completed = false;
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: { method?: string }) => {
      if (init?.method === 'POST') {
        completed = true;
        return Promise.resolve(new Response(JSON.stringify({ error: '오류' }), { status: 500 }));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ today, reviews: completed ? [] : [review()] })),
      );
    }),
  );
  render(<Reviews />);
  fireEvent.click(await screen.findByRole('button', { name: /복습 완료/ }));
  await screen.findByRole('alert');
  await waitFor(() => expect(document.activeElement?.id).toBe('reviews-today'));
});

test('a failed reload keeps the list on screen and reports it', async () => {
  let posted = false;
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: { method?: string }) => {
      if (init?.method === 'POST') {
        posted = true;
        return Promise.resolve(new Response(JSON.stringify({ next: null })));
      }
      return Promise.resolve(
        posted
          ? new Response(JSON.stringify({ error: '목록 오류' }), { status: 500 })
          : new Response(JSON.stringify({ today, reviews: [review()] })),
      );
    }),
  );
  render(<Reviews />);
  fireEvent.click(await screen.findByRole('button', { name: /복습 완료/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('복습 목록을 불러오지 못했습니다');
  expect(screen.getByRole('button', { name: /복습 완료/ })).toBeInTheDocument();
});

test('the same message twice is cleared in between, so it is announced again', async () => {
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  let posts = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: { method?: string }) => {
      if (init?.method !== 'POST')
        return new Response(JSON.stringify({ today, reviews: [review()] }));
      if (++posts === 2) await held;
      return new Response(JSON.stringify({ next: { round: 2, dueDate: '2026-11-02' } }));
    }),
  );
  render(<Reviews />);
  const message = '복습을 완료했습니다. 다음 복습은 2026-11-02입니다';
  fireEvent.click(await screen.findByRole('button', { name: /복습 완료/ }));
  await screen.findByText(message);
  await waitFor(() => expect(screen.getByRole('button', { name: /복습 완료/ })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: /복습 완료/ }));
  await waitFor(() => expect(screen.queryByText(message)).toBeNull());
  release();
  await screen.findByText(message);
});

test('a completion reports the change once the list is up to date', async () => {
  server([review()], done({ round: 2, dueDate: '2026-11-02' }));
  const onChange = vi.fn();
  render(<Reviews onChange={onChange} />);
  fireEvent.click(await screen.findByRole('button', { name: /복습 완료/ }));
  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
  expect(screen.getByText('오늘 복습할 내용이 없습니다')).toBeInTheDocument();
});

test('a failed completion reports a change too: it may be gone elsewhere', async () => {
  server([review()], () => ({ status: 409, body: { error: '이미 완료한 복습입니다' } }));
  const onChange = vi.fn();
  render(<Reviews onChange={onChange} />);
  fireEvent.click(await screen.findByRole('button', { name: /복습 완료/ }));
  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
});

test('two quick clicks send one completion', async () => {
  const fetch = server([review()], done({ round: 2, dueDate: '2026-11-02' }));
  render(<Reviews />);
  const button = await screen.findByRole('button', { name: /복습 완료/ });
  fireEvent.click(button);
  fireEvent.click(button);
  await screen.findByText('오늘 복습할 내용이 없습니다');
  const posts = fetch.mock.calls.filter(([, init]) => init?.method === 'POST');
  expect(posts).toHaveLength(1);
});

test('a failed load reports the error instead of saying nothing is due', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: '오류' }), { status: 500 }))),
  );
  render(<Reviews />);
  expect(await screen.findByRole('alert')).toHaveTextContent('복습 목록을 불러오지 못했습니다');
  expect(screen.queryByText('오늘 복습할 내용이 없습니다')).toBeNull();
});
