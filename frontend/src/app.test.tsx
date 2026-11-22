import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test } from 'vitest';

import { App } from './app';
import { fakeApi } from './test/fake-api';

const failing = { status: 500, body: { error: 'Test server' } };

// /api/health answers with the server date; the pages' own endpoints fail, so pages show their
// own errors.
function server(health: { body: object; status?: number }) {
  return fakeApi({
    'GET /api/health': { body: health.body, status: health.status },
    ...Object.fromEntries(
      [
        '/api/keywords',
        '/api/retrospectives/period',
        '/api/retrospectives',
        '/api/reviews/today',
        '/api/reviews/today/count',
        '/api/schedules',
        '/api/stats/heatmap',
        '/api/stats/reviews',
        '/api/stats/study-time',
        '/api/stats/textbooks',
        '/api/study-logs/calendar',
        '/api/study-logs',
        '/api/textbooks',
      ].map((path) => [`GET ${path}`, failing]),
    ),
  });
}

test('the study log is the first page and shows the server date', async () => {
  server({ body: { today: '2026-10-26' } });
  render(<App />);
  expect(screen.getByRole('heading', { level: 1, name: 'Study log' })).toBeInTheDocument();
  expect(await screen.findByText('Server connected · 2026-10-26')).toBeInTheDocument();
});

test('reports a server error as an alert and does not open the page body', async () => {
  server({ body: { error: 'Cannot connect to the database' }, status: 503 });
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Cannot connect to the database');
  expect(document.querySelector('.legacy')).toBeNull();
});

test('each page has its own address and is marked in the main menu', async () => {
  server({ body: { today: '2026-10-26' } });
  render(<App />);
  const menu = screen.getByRole('navigation', { name: 'Main menu' });
  for (const [label, path] of [
    ['Schedules', '/schedules'],
    ['Reviews', '/reviews'],
    ['Textbooks', '/textbooks'],
    ['Keywords', '/keywords'],
    ['Stats', '/stats'],
    ['Retrospectives', '/retrospectives'],
    ['Settings', '/settings'],
  ]) {
    fireEvent.click(within(menu).getByRole('link', { name: label }));
    expect(window.location.pathname).toBe(path);
    expect(await screen.findByRole('heading', { level: 1, name: label })).toBeInTheDocument();
    expect(within(menu).getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
  }
});

test('saving a log and completing a review update the badge, and the pages stay mounted', async () => {
  let due = 1;
  fakeApi({
    'GET /api/health': { body: { today: '2026-10-26' } },
    'GET /api/reviews/today/count': () => ({ body: { count: due } }),
    'GET /api/reviews/today': () => ({
      body: {
        today: '2026-10-26',
        reviews: Array.from({ length: due }, (_, index) => ({
          id: index + 1,
          round: 1,
          dueDate: '2026-10-26',
          studyDate: '2026-10-25',
          memo: '',
          textbookTitle: null,
          contentNumber: null,
          contentTitle: null,
        })),
      },
    }),
    'POST /api/study-logs': () => {
      due = 2;
      return { body: { studyLog: {} } };
    },
    'POST /api/reviews/1/complete': () => {
      due -= 1;
      return { body: { next: { round: 2, dueDate: '2026-10-28' } } };
    },
    'POST /api/reviews/2/complete': () => {
      due -= 1;
      return { body: { next: { round: 2, dueDate: '2026-10-28' } } };
    },
    'GET /api/study-logs': { body: { studyLogs: [] } },
    'GET /api/study-logs/calendar': failing,
    'GET /api/textbooks': { body: { textbooks: [] } },
  });
  window.history.replaceState(null, '', '/');
  render(<App />);
  await screen.findByRole('link', { name: '1 reviews today' });

  const form = document.querySelector('.study-logs form')!;
  fireEvent.submit(form);
  await screen.findByRole('link', { name: '2 reviews today' });
  // Counting again re-renders the app; a remounted page would lose what is being typed.
  expect(document.querySelector('.study-logs form')).toBe(form);

  const menu = screen.getByRole('navigation', { name: 'Main menu' });
  fireEvent.click(within(menu).getByRole('link', { name: 'Reviews' }));
  const heading = await screen.findByRole('heading', { name: 'Reviews for today (2)' });
  const card = heading.closest('section');
  fireEvent.click(screen.getAllByRole('button', { name: /complete review/ })[0]);
  await screen.findByRole('link', { name: '1 reviews today' });
  expect(heading.closest('section')).toBe(card);
  expect(heading.isConnected).toBe(true);
});

test('an unknown address falls back to the study log', async () => {
  server({ body: { today: '2026-10-26' } });
  window.history.replaceState(null, '', '/no-such-page');
  render(<App />);
  expect(await screen.findByRole('heading', { level: 1, name: 'Study log' })).toBeInTheDocument();
  expect(window.location.pathname).toBe('/');
});
