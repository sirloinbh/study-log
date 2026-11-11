import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  expect(reviewTitle(review())).toBe('2026-10-30 study');
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
  expect(await screen.findByText('Nothing to review today')).toBeInTheDocument();
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
  expect(await screen.findByText('3 days late')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Reviews for today (2)' })).toBeInTheDocument();
  expect(screen.getByText('Round 2')).toBeInTheDocument();
  expect(screen.getAllByText(/days late/)).toHaveLength(1);
});

test('completing removes the review, shows the next date and moves focus', async () => {
  const fetch = server([review()], done({ round: 2, dueDate: '2026-11-02' }));
  render(<Reviews />);
  fireEvent.click(
    await screen.findByRole('button', { name: '2026-10-30 study round 1 complete review' }),
  );
  expect(
    await screen.findByText('Review completed. The next review is on 2026-11-02'),
  ).toBeInTheDocument();
  expect(await screen.findByText('Nothing to review today')).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledWith(
    '/api/reviews/1/complete',
    expect.objectContaining({ method: 'POST' }),
  );
  await waitFor(() => expect(document.activeElement?.id).toBe('reviews-today'));
});

test('completing the last round says the reviews are finished', async () => {
  server([review({ round: 5 })], done(null));
  render(<Reviews />);
  fireEvent.click(await screen.findByRole('button', { name: /round 5 complete review/ }));
  expect(
    await screen.findByText('Review completed. All reviews of this log are done'),
  ).toBeInTheDocument();
});

test('a failed completion keeps the review, reports it and returns focus to its button', async () => {
  server([review()], () => ({ status: 500, body: { error: 'A server error occurred' } }));
  render(<Reviews />);
  const button = await screen.findByRole('button', { name: /complete review/ });
  fireEvent.click(button);
  expect(await screen.findByRole('alert')).toHaveTextContent('A server error occurred');
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /complete review/ })),
  );
});

test('a review already completed elsewhere leaves the list and focus goes to the heading', async () => {
  for (const [status, error] of [
    [409, 'This review is already completed'],
    [404, 'Review not found'],
  ] as const) {
    const { unmount } = render(<ReviewsWithGone status={status} error={error} />);
    fireEvent.click(await screen.findByRole('button', { name: /complete review/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(error);
    expect(await screen.findByText('Nothing to review today')).toBeInTheDocument();
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
        return Promise.resolve(new Response(JSON.stringify({ error: 'Error' }), { status: 500 }));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ today, reviews: completed ? [] : [review()] })),
      );
    }),
  );
  render(<Reviews />);
  fireEvent.click(await screen.findByRole('button', { name: /complete review/ }));
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
          ? new Response(JSON.stringify({ error: 'List error' }), { status: 500 })
          : new Response(JSON.stringify({ today, reviews: [review()] })),
      );
    }),
  );
  render(<Reviews />);
  fireEvent.click(await screen.findByRole('button', { name: /complete review/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the reviews');
  expect(screen.getByRole('button', { name: /complete review/ })).toBeInTheDocument();
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
  const message = 'Review completed. The next review is on 2026-11-02';
  fireEvent.click(await screen.findByRole('button', { name: /complete review/ }));
  await screen.findByText(message);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /complete review/ })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole('button', { name: /complete review/ }));
  await waitFor(() => expect(screen.queryByText(message)).toBeNull());
  release();
  await screen.findByText(message);
});

test('a completion reports the change once the list is up to date', async () => {
  server([review()], done({ round: 2, dueDate: '2026-11-02' }));
  const onChange = vi.fn();
  render(<Reviews onChange={onChange} />);
  fireEvent.click(await screen.findByRole('button', { name: /complete review/ }));
  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
  expect(screen.getByText('Nothing to review today')).toBeInTheDocument();
});

test('a failed completion reports a change too: it may be gone elsewhere', async () => {
  server([review()], () => ({ status: 409, body: { error: 'This review is already completed' } }));
  const onChange = vi.fn();
  render(<Reviews onChange={onChange} />);
  fireEvent.click(await screen.findByRole('button', { name: /complete review/ }));
  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
});

// Each range has its own list; changes answer `moved` and take the review out when told to.
function rangeServer(
  lists: Record<string, Review[]>,
  moved: () => { status: number; body: object; leaves?: boolean } = () => ({
    status: 200,
    body: { dueDate: '2026-11-05' },
  }),
) {
  const fetch = vi.fn((url: string, init?: { method?: string }) => {
    if (init?.method && init.method !== 'GET') {
      const answer = moved();
      if (answer.leaves) for (const key of Object.keys(lists)) lists[key] = [];
      return Promise.resolve(new Response(JSON.stringify(answer.body), { status: answer.status }));
    }
    const range = url.split('/').pop()!;
    return Promise.resolve(new Response(JSON.stringify({ today, reviews: lists[range] })));
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

const changes = (fetch: ReturnType<typeof rangeServer>) =>
  fetch.mock.calls.filter(([, init]) => init?.method && init.method !== 'GET');

test('picking a range lists it, marks it and says when it is empty', async () => {
  const fetch = rangeServer({
    today: [review()],
    week: [review({ id: 2 }), review({ id: 3 })],
    all: [],
  });
  render(<Reviews />);
  await screen.findByRole('heading', { name: 'Reviews for today (1)' });
  expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true');

  fireEvent.click(screen.getByRole('button', { name: 'This week' }));
  await screen.findByRole('heading', { name: 'Reviews this week (2)' });
  expect(screen.getByRole('button', { name: 'This week' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'false');

  fireEvent.click(screen.getByRole('button', { name: 'All' }));
  expect(await screen.findByText('No reviews left')).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledWith('/api/reviews/week', expect.anything());
  expect(fetch).toHaveBeenCalledWith('/api/reviews/all', expect.anything());
});

test('a slow answer for the range left behind is not shown', async () => {
  let answerToday = (_value: Response) => {};
  const slow = new Promise<Response>((resolve) => (answerToday = resolve));
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      url.endsWith('/today')
        ? slow
        : Promise.resolve(new Response(JSON.stringify({ today, reviews: [] }))),
    ),
  );
  render(<Reviews />);
  fireEvent.click(screen.getByRole('button', { name: 'All' }));
  await screen.findByText('No reviews left');
  answerToday(new Response(JSON.stringify({ today, reviews: [review()] })));
  await new Promise((resolve) => setTimeout(resolve));
  expect(screen.getByText('No reviews left')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /complete review/ })).toBeNull();
});

test('a failed list shows for its own range only', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        url.endsWith('/week')
          ? new Response(JSON.stringify({ error: 'Weekly error' }), { status: 500 })
          : new Response(JSON.stringify({ today, reviews: [] })),
      ),
    ),
  );
  render(<Reviews />);
  fireEvent.click(screen.getByRole('button', { name: 'This week' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Weekly error');
  fireEvent.click(screen.getByRole('button', { name: 'All' }));
  await screen.findByText('No reviews left');
  expect(screen.queryByRole('alert')).toBeNull();
});

test('snoozing reports the new date, reloads the range and tells the badge', async () => {
  const fetch = rangeServer({ today: [review()] }, () => ({
    status: 200,
    body: { dueDate: '2026-11-01' },
    leaves: true,
  }));
  const onChange = vi.fn();
  render(<Reviews onChange={onChange} />);
  fireEvent.click(await screen.findByRole('button', { name: /postpone a day/ }));
  expect(
    await screen.findByText('Postponed by a day. The new due date is 2026-11-01'),
  ).toBeInTheDocument();
  expect(await screen.findByText('Nothing to review today')).toBeInTheDocument();
  expect(changes(fetch)[0][0]).toBe('/api/reviews/1/snooze');
  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
  // Its button left with the review, so focus goes to the heading.
  await waitFor(() => expect(document.activeElement?.id).toBe('reviews-today'));
});

test('a snooze that keeps the review in the range keeps focus on its button', async () => {
  rangeServer({ today: [review()] });
  render(<Reviews />);
  fireEvent.click(await screen.findByRole('button', { name: /postpone a day/ }));
  await screen.findByText(/Postponed by a day/);
  await waitFor(() => expect(document.activeElement?.id).toBe('review-snooze-1'));
});

test('changing a date sends it, closes the form and returns focus', async () => {
  const fetch = rangeServer({ today: [review({ dueDate: today })] });
  const onChange = vi.fn();
  render(<Reviews onChange={onChange} />);
  fireEvent.click(await screen.findByRole('button', { name: /change date/ }));
  const field = screen.getByLabelText('New due date');
  expect(field).toHaveValue(today);
  await waitFor(() => expect(document.activeElement).toBe(field));
  fireEvent.change(field, { target: { value: '2026-11-05' } });
  fireEvent.click(screen.getByRole('button', { name: /save due date/ }));
  expect(await screen.findByText('Changed the due date to 2026-11-05')).toBeInTheDocument();
  expect(screen.queryByLabelText('New due date')).toBeNull();
  const [url, init] = changes(fetch)[0] as [string, { method: string; body: string }];
  expect(url).toBe('/api/reviews/1/due-date');
  expect(init.method).toBe('PUT');
  expect(JSON.parse(init.body)).toEqual({ dueDate: '2026-11-05' });
  await waitFor(() => expect(document.activeElement?.id).toBe('review-edit-1'));
  expect(onChange).toHaveBeenCalledTimes(1);
});

test('cancelling a date change sends nothing and returns focus', async () => {
  const fetch = rangeServer({ today: [review()] });
  render(<Reviews />);
  fireEvent.click(await screen.findByRole('button', { name: /change date/ }));
  fireEvent.click(screen.getByRole('button', { name: /cancel due date change/ }));
  expect(screen.queryByLabelText('New due date')).toBeNull();
  expect(changes(fetch)).toEqual([]);
  await waitFor(() => expect(document.activeElement?.id).toBe('review-edit-1'));
});

test('a refused date keeps what was typed and returns focus to the field', async () => {
  rangeServer({ today: [review()] }, () => ({
    status: 400,
    body: { error: 'This date does not exist' },
  }));
  render(<Reviews />);
  fireEvent.click(await screen.findByRole('button', { name: /change date/ }));
  fireEvent.change(screen.getByLabelText('New due date'), { target: { value: '2026-11-05' } });
  fireEvent.click(screen.getByRole('button', { name: /save due date/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('This date does not exist');
  expect(screen.getByLabelText('New due date')).toHaveValue('2026-11-05');
  await waitFor(() => expect(document.activeElement?.id).toBe('review-due-date'));
});

test('a date change for a review completed elsewhere closes the form', async () => {
  rangeServer({ today: [review()] }, () => ({
    status: 409,
    body: { error: 'This review is already completed' },
    leaves: true,
  }));
  render(<Reviews />);
  fireEvent.click(await screen.findByRole('button', { name: /change date/ }));
  fireEvent.click(screen.getByRole('button', { name: /save due date/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('This review is already completed');
  expect(screen.queryByLabelText('New due date')).toBeNull();
  await waitFor(() => expect(document.activeElement?.id).toBe('reviews-today'));
});

test('another range closes the open date form and clears the message', async () => {
  rangeServer({ today: [review()], all: [review()] });
  render(<Reviews />);
  fireEvent.click(await screen.findByRole('button', { name: /postpone a day/ }));
  await screen.findByText(/Postponed by a day/);
  await waitFor(() => expect(screen.getByRole('button', { name: /change date/ })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: /change date/ }));
  screen.getByLabelText('New due date');
  fireEvent.click(screen.getByRole('button', { name: 'All' }));
  await screen.findByRole('heading', { name: 'All reviews (1)' });
  expect(screen.queryByLabelText('New due date')).toBeNull();
  expect(screen.queryByText(/Postponed by a day/)).toBeNull();
});

test('the range already shown keeps a date being typed and sends nothing', async () => {
  const fetch = rangeServer({ today: [review()] });
  render(<Reviews />);
  fireEvent.click(await screen.findByRole('button', { name: /change date/ }));
  fireEvent.change(screen.getByLabelText('New due date'), { target: { value: '2026-11-05' } });
  const before = fetch.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Today' }));
  expect(screen.getByLabelText('New due date')).toHaveValue('2026-11-05');
  expect(fetch.mock.calls.length).toBe(before);
});

test('the range already shown tries again after a failed list', async () => {
  let fail = true;
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        fail
          ? new Response(JSON.stringify({ error: 'List error' }), { status: 500 })
          : new Response(JSON.stringify({ today, reviews: [] })),
      ),
    ),
  );
  render(<Reviews />);
  expect(await screen.findByRole('alert')).toHaveTextContent('List error');
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Today' }));
  expect(await screen.findByText('Nothing to review today')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).toBeNull();
});

test('a retry unlocks the buttons, returns focus and shows that it is loading', async () => {
  let answer = (_value: Response) => {};
  let calls = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      calls += 1;
      if (calls === 1)
        return Promise.resolve(
          new Response(JSON.stringify({ error: 'List error' }), { status: 500 }),
        );
      return new Promise<Response>((resolve) => (answer = resolve));
    }),
  );
  render(<Reviews />);
  await screen.findByRole('alert');
  const button = screen.getByRole('button', { name: 'Today' });
  fireEvent.click(button);
  // The old error is gone while trying, so the same error coming back is announced again.
  expect(await screen.findByText('Loading the reviews…')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(button).toBeDisabled();
  answer(new Response(JSON.stringify({ error: 'List error' }), { status: 500 }));
  expect(await screen.findByRole('alert')).toHaveTextContent('List error');
  await waitFor(() => expect(button).toBeEnabled());
  await waitFor(() => expect(document.activeElement).toBe(button));
});

test('a retry that works clears the error of the change before it', async () => {
  let failing = true;
  let fetchedOnce = false;
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: { method?: string }) => {
      if (init?.method === 'POST')
        return Promise.resolve(
          new Response(JSON.stringify({ error: 'Change error' }), { status: 500 }),
        );
      if (failing && fetchedOnce)
        return Promise.resolve(
          new Response(JSON.stringify({ error: 'List error' }), { status: 500 }),
        );
      fetchedOnce = true;
      return Promise.resolve(new Response(JSON.stringify({ today, reviews: [review()] })));
    }),
  );
  render(<Reviews />);
  fireEvent.click(await screen.findByRole('button', { name: /postpone a day/ }));
  await screen.findByText('Change error');
  await screen.findByText(/List error/);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Today' })).toBeEnabled());
  failing = false;
  fireEvent.click(screen.getByRole('button', { name: 'Today' }));
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  expect(screen.getByRole('button', { name: /postpone a day/ })).toBeInTheDocument();
});

test('a slow older answer does not bring back a review just completed', async () => {
  let answerOld = (_value: Response) => {};
  let todayLists = 0;
  const list = (reviews: Review[]) =>
    Promise.resolve(new Response(JSON.stringify({ today, reviews })));
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: { method?: string }) => {
      if (init?.method === 'POST')
        return Promise.resolve(new Response(JSON.stringify({ next: null })));
      // The week's list never answers, so the page still shows today's when today is picked again.
      if (url.endsWith('/week')) return new Promise<Response>(() => {});
      todayLists += 1;
      if (todayLists === 1) return list([review()]);
      if (todayLists === 2) return new Promise<Response>((resolve) => (answerOld = resolve));
      return list([]);
    }),
  );
  render(<Reviews />);
  await screen.findByRole('button', { name: /complete review/ });
  fireEvent.click(screen.getByRole('button', { name: 'This week' }));
  fireEvent.click(screen.getByRole('button', { name: 'Today' }));
  fireEvent.click(screen.getByRole('button', { name: /complete review/ }));
  await screen.findByText('Nothing to review today');
  answerOld(new Response(JSON.stringify({ today, reviews: [review()] })));
  await new Promise((resolve) => setTimeout(resolve));
  expect(screen.getByText('Nothing to review today')).toBeInTheDocument();
});

test('returning to the tab loads the range on screen again', async () => {
  const lists: Record<string, Review[]> = { today: [], week: [] };
  const fetch = rangeServer(lists);
  render(<Reviews />);
  await screen.findByText('Nothing to review today');
  lists.today = [review()];
  fireEvent.focus(window);
  await screen.findByRole('heading', { name: 'Reviews for today (1)' });

  fireEvent.click(screen.getByRole('button', { name: 'This week' }));
  await screen.findByText('Nothing to review this week');
  lists.week = [review(), review({ id: 2 })];
  fireEvent.focus(window);
  await screen.findByRole('heading', { name: 'Reviews this week (2)' });
  expect(fetch.mock.calls.at(-1)?.[0]).toBe('/api/reviews/week');
});

test('returning to the tab keeps a date being typed', async () => {
  const lists = { today: [review()] };
  const fetch = rangeServer(lists);
  render(<Reviews />);
  fireEvent.click(await screen.findByRole('button', { name: /change date/ }));
  fireEvent.change(screen.getByLabelText('New due date'), { target: { value: '2026-11-05' } });
  const before = fetch.mock.calls.length;
  fireEvent.focus(window);
  await waitFor(() => expect(fetch.mock.calls.length).toBe(before + 1));
  await act(async () => {});
  expect(screen.getByLabelText('New due date')).toHaveValue('2026-11-05');
});

test('a review leaving the list closes its date form for good and says so', async () => {
  const lists: Record<string, Review[]> = { today: [review()] };
  rangeServer(lists);
  render(<Reviews />);
  fireEvent.click(await screen.findByRole('button', { name: /change date/ }));
  fireEvent.change(screen.getByLabelText('New due date'), { target: { value: '2026-11-05' } });
  await waitFor(() => expect(document.activeElement?.id).toBe('review-due-date'));

  lists.today = [];
  fireEvent.focus(window);
  expect(
    await screen.findByText(
      'The review whose date you were changing left the list, so the input was closed',
    ),
  ).toBeInTheDocument();
  await waitFor(() => expect(document.activeElement?.id).toBe('reviews-today'));

  // It comes back later, with its buttons and not the old form.
  lists.today = [review()];
  fireEvent.focus(window);
  await screen.findByRole('button', { name: /change date/ });
  expect(screen.queryByLabelText('New due date')).toBeNull();
});

test('a review leaving the list replaces an error about its date', async () => {
  const lists: Record<string, Review[]> = { today: [review()] };
  rangeServer(lists, () => ({ status: 400, body: { error: 'This date does not exist' } }));
  render(<Reviews />);
  fireEvent.click(await screen.findByRole('button', { name: /change date/ }));
  fireEvent.click(screen.getByRole('button', { name: /save due date/ }));
  await screen.findByRole('alert');
  await waitFor(() => expect(screen.getByRole('button', { name: 'All' })).toBeEnabled());
  lists.today = [];
  fireEvent.focus(window);
  await screen.findByText(/the input was closed/);
  expect(screen.queryByRole('alert')).toBeNull();
});

test('focus moves to the heading only when the focused review left the list', async () => {
  const lists: Record<string, Review[]> = {
    today: [review({ id: 1, studyDate: '2026-10-29' }), review({ id: 2, studyDate: '2026-10-30' })],
  };
  rangeServer(lists);
  render(<Reviews />);
  const kept = await screen.findByRole('button', {
    name: '2026-10-29 study round 1 complete review',
  });
  kept.focus();

  lists.today = [review({ id: 1, studyDate: '2026-10-29' })];
  fireEvent.focus(window);
  await screen.findByRole('heading', { name: 'Reviews for today (1)' });
  expect(document.activeElement).toBe(kept);

  lists.today = [];
  fireEvent.focus(window);
  await screen.findByText('Nothing to review today');
  await waitFor(() => expect(document.activeElement?.id).toBe('reviews-today'));
});

test('focus is left alone when it is not on a review', async () => {
  const lists: Record<string, Review[]> = { today: [review()] };
  rangeServer(lists);
  render(<Reviews />);
  const range = await screen.findByRole('button', { name: 'Today' });
  range.focus();
  lists.today = [];
  fireEvent.focus(window);
  await screen.findByText('Nothing to review today');
  await act(async () => {});
  expect(document.activeElement).toBe(range);
});

test('a form closing does not take focus from another control', async () => {
  const first = review({ id: 1, studyDate: '2026-10-29' });
  const second = review({ id: 2, studyDate: '2026-10-30' });
  const lists: Record<string, Review[]> = { today: [first, second] };
  rangeServer(lists);
  render(<Reviews />);
  fireEvent.click(
    await screen.findByRole('button', { name: '2026-10-29 study round 1 change date' }),
  );
  await waitFor(() => expect(document.activeElement?.id).toBe('review-due-date'));
  const other = screen.getByRole('button', { name: '2026-10-30 study round 1 complete review' });
  other.focus();

  lists.today = [second];
  fireEvent.focus(window);
  await screen.findByText(/the input was closed/);
  await act(async () => {});
  expect(document.activeElement).toBe(other);
});

test('focus moved while the list was on its way stays where it went', async () => {
  const first = review({ id: 1, studyDate: '2026-10-29' });
  const second = review({ id: 2, studyDate: '2026-10-30' });
  let answer = (_value: Response) => {};
  let lists = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      ++lists === 1
        ? Promise.resolve(new Response(JSON.stringify({ today, reviews: [first, second] })))
        : new Promise<Response>((resolve) => (answer = resolve)),
    ),
  );
  render(<Reviews />);
  (await screen.findByRole('button', { name: '2026-10-29 study round 1 complete review' })).focus();
  fireEvent.focus(window);
  const moved = screen.getByRole('button', { name: '2026-10-30 study round 1 complete review' });
  moved.focus();
  answer(new Response(JSON.stringify({ today, reviews: [second] })));
  await screen.findByRole('heading', { name: 'Reviews for today (1)' });
  await act(async () => {});
  expect(document.activeElement).toBe(moved);
});

test('a form closing keeps the failure of another review on screen', async () => {
  const first = review({ id: 1, studyDate: '2026-10-29' });
  const second = review({ id: 2, studyDate: '2026-10-30' });
  const lists: Record<string, Review[]> = { today: [first, second] };
  rangeServer(lists, () => {
    lists.today = [second];
    return { status: 500, body: { error: 'A server error occurred' } };
  });
  render(<Reviews />);
  fireEvent.click(
    await screen.findByRole('button', { name: '2026-10-29 study round 1 change date' }),
  );
  fireEvent.click(screen.getByRole('button', { name: '2026-10-30 study round 1 postpone a day' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('A server error occurred');
  await waitFor(() => expect(screen.queryByLabelText('New due date')).toBeNull());
  expect(screen.getByRole('alert')).toHaveTextContent('A server error occurred');
  await waitFor(() => expect(document.activeElement?.id).toBe('review-snooze-2'));
});

test('a later return clears the error of a failed one', async () => {
  let failing = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        failing
          ? new Response(JSON.stringify({ error: 'List error' }), { status: 500 })
          : new Response(JSON.stringify({ today, reviews: [review()] })),
      ),
    ),
  );
  render(<Reviews />);
  await screen.findByRole('button', { name: /complete review/ });
  failing = true;
  fireEvent.focus(window);
  expect(await screen.findByRole('alert')).toHaveTextContent('List error');
  expect(screen.getByRole('button', { name: /complete review/ })).toBeInTheDocument();
  failing = false;
  fireEvent.focus(window);
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
});

test('returning to the tab while a change runs adds no request', async () => {
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  const fetch = vi.fn(async (_url: string, init?: { method?: string }) => {
    if (init?.method && init.method !== 'GET') {
      await held;
      return new Response(JSON.stringify({ dueDate: '2026-11-01' }));
    }
    return new Response(JSON.stringify({ today, reviews: [review()] }));
  });
  vi.stubGlobal('fetch', fetch);
  render(<Reviews />);
  fireEvent.click(await screen.findByRole('button', { name: /postpone a day/ }));
  const before = fetch.mock.calls.length;
  fireEvent.focus(window);
  await act(async () => {});
  expect(fetch.mock.calls.length).toBe(before);
  release();
  await waitFor(() => expect(screen.getByRole('button', { name: 'All' })).toBeEnabled());
});

test('the listener goes away with the page', async () => {
  const lists = { today: [review()] };
  const fetch = rangeServer(lists);
  const { unmount } = render(<Reviews />);
  await screen.findByRole('button', { name: /complete review/ });
  unmount();
  const before = fetch.mock.calls.length;
  fireEvent.focus(window);
  expect(fetch.mock.calls.length).toBe(before);
});

test('changing another review closes the date form being typed', async () => {
  const lists = {
    today: [review({ id: 1, studyDate: '2026-10-29' }), review({ id: 2, studyDate: '2026-10-30' })],
  };
  rangeServer(lists);
  render(<Reviews />);
  fireEvent.click(
    await screen.findByRole('button', { name: '2026-10-29 study round 1 change date' }),
  );
  screen.getByLabelText('New due date');
  fireEvent.click(screen.getByRole('button', { name: '2026-10-30 study round 1 postpone a day' }));
  await screen.findByText(/Postponed by a day/);
  expect(screen.queryByLabelText('New due date')).toBeNull();

  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: '2026-10-29 study round 1 change date' }),
    ).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole('button', { name: '2026-10-29 study round 1 change date' }));
  screen.getByLabelText('New due date');
  fireEvent.click(screen.getByRole('button', { name: '2026-10-30 study round 1 complete review' }));
  await screen.findByText(/Review completed/);
  expect(screen.queryByLabelText('New due date')).toBeNull();
});

test('the range buttons wait while a change runs', async () => {
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: { method?: string }) => {
      if (init?.method && init.method !== 'GET') {
        await held;
        return new Response(JSON.stringify({ dueDate: '2026-11-01' }));
      }
      return new Response(JSON.stringify({ today, reviews: [review()] }));
    }),
  );
  render(<Reviews />);
  fireEvent.click(await screen.findByRole('button', { name: /postpone a day/ }));
  expect(screen.getByRole('button', { name: 'All' })).toBeDisabled();
  release();
  await waitFor(() => expect(screen.getByRole('button', { name: 'All' })).toBeEnabled());
});

test('two quick clicks send one completion', async () => {
  const fetch = server([review()], done({ round: 2, dueDate: '2026-11-02' }));
  render(<Reviews />);
  const button = await screen.findByRole('button', { name: /complete review/ });
  fireEvent.click(button);
  fireEvent.click(button);
  await screen.findByText('Nothing to review today');
  const posts = fetch.mock.calls.filter(([, init]) => init?.method === 'POST');
  expect(posts).toHaveLength(1);
});

test('a failed load reports the error instead of saying nothing is due', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: 'Error' }), { status: 500 }))),
  );
  render(<Reviews />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the reviews');
  expect(screen.queryByText('Nothing to review today')).toBeNull();
});
