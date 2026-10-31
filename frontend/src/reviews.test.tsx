import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

test('days overdue count whole days and never go below zero', () => {
  expect(overdueDays('2026-10-31', today)).toBe(0);
  expect(overdueDays('2026-10-28', today)).toBe(3);
  expect(overdueDays('2026-11-02', today)).toBe(0);
  expect(overdueDays('2024-02-28', '2024-03-01')).toBe(2);
});

test('the title names the textbook and chapter, or else the memo, or else the date', () => {
  const book = { textbookTitle: '선형대수' };
  expect(reviewTitle(review(book))).toBe('선형대수');
  expect(reviewTitle(review({ ...book, contentNumber: '2', contentTitle: '행렬' }))).toBe(
    '선형대수 · 2 행렬',
  );
  expect(reviewTitle(review({ memo: '\n  첫 줄\n둘째 줄' }))).toBe('첫 줄');
  expect(reviewTitle(review({ memo: 'ㄱ'.repeat(41) }))).toBe(`${'ㄱ'.repeat(40)}…`);
  expect(reviewTitle(review({ memo: ' ' }))).toBe('2026-10-30 학습');
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
  fireEvent.click(await screen.findByRole('button', { name: '고유값 정리 1회차 복습 완료' }));
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
