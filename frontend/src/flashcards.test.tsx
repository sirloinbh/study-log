import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, test } from 'vitest';

import { Flashcards } from './flashcards';
import { fakeApi } from './test/fake-api';
import { render } from './test/render';

const today = '2026-11-23';
const card = (id: number, keyword: string, memo = '', known: boolean | null = null) => ({
  id,
  date: '2026-11-22',
  keyword,
  memo,
  known,
});

const serve = (
  cards: ReturnType<typeof card>[],
  put: () => { status?: number; body?: unknown } = () => ({ body: {} }),
) =>
  fakeApi({
    'GET /api/flashcards': () => ({ body: { date: today, cards } }),
    'PUT /api/flashcards/1': put,
    'PUT /api/flashcards/2': put,
  });

const keyword = () => screen.getByRole('heading', { level: 3 });

test('shows the cards one at a time, flips for the memo, and records each answer', async () => {
  const api = serve([card(1, '고유값', 'Ax = λx'), card(2, '대각화')]);
  render(<Flashcards today={today} />);
  expect(await screen.findByRole('heading', { level: 3, name: '고유값' })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Card 1 of 2');
  expect(screen.queryByText('Ax = λx')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Show memo' }));
  expect(screen.getByText(/Ax = λx/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'I knew it' }));
  await waitFor(() => expect(keyword()).toHaveTextContent('대각화'));
  expect(api.sent).toEqual([
    { method: 'PUT', path: '/api/flashcards/1', body: { date: today, known: true } },
  ]);
  expect(screen.queryByText(/Ax = λx/)).toBeNull();
  expect(keyword()).toHaveFocus();

  fireEvent.click(screen.getByRole('button', { name: 'Show memo' }));
  expect(screen.getByText('No memo for this keyword.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Not yet' }));
  expect(await screen.findByText(/All 2 cards done: 1 known, 1 to see again/)).toBeInTheDocument();
  expect(api.sent[1]).toMatchObject({ path: '/api/flashcards/2', body: { known: false } });

  fireEvent.click(screen.getByRole('button', { name: 'Go through them again' }));
  expect(await screen.findByRole('heading', { level: 3, name: '고유값' })).toBeInTheDocument();
});

test('starts at the first card not answered today', async () => {
  serve([card(1, '고유값', '', true), card(2, '대각화')]);
  render(<Flashcards today={today} />);
  expect(await screen.findByRole('heading', { level: 3, name: '대각화' })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Card 2 of 2');
});

test('a failed answer says why and stays on the card', async () => {
  serve([card(1, '고유값')], () => ({ status: 500, body: { error: 'Server error' } }));
  render(<Flashcards today={today} />);
  fireEvent.click(await screen.findByRole('button', { name: 'I knew it' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Server error');
  expect(keyword()).toHaveTextContent('고유값');
});

test('no cards today says what they are', async () => {
  serve([]);
  render(<Flashcards today={today} />);
  expect(await screen.findByText(/No flashcards today/)).toBeInTheDocument();
});

test('a failed load offers a retry', async () => {
  let fail = true;
  const api = fakeApi({
    'GET /api/flashcards': () =>
      fail
        ? { status: 500, body: { error: 'Server error' } }
        : { body: { date: today, cards: [card(1, '고유값')] } },
  });
  render(<Flashcards today={today} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not load the flashcards: Server error',
  );
  expect(api.requests.length).toBeGreaterThan(0);
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading the flashcards' }));
  expect(await screen.findByRole('heading', { level: 3, name: '고유값' })).toBeInTheDocument();
});
