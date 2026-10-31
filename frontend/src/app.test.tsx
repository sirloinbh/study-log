import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { App } from './app';

// /api/health answers with the server date; other endpoints fail, so pages show their own errors.
function server(health: { body: object; status?: number }) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        url === '/api/health'
          ? new Response(JSON.stringify(health.body), { status: health.status ?? 200 })
          : new Response(JSON.stringify({ error: '테스트 서버' }), { status: 500 }),
      ),
    ),
  );
}

test('the study log is the first page and shows the server date', async () => {
  server({ body: { today: '2026-10-26' } });
  render(<App />);
  expect(screen.getByRole('heading', { level: 1, name: '학습 기록' })).toBeInTheDocument();
  expect(await screen.findByText('서버 연결됨 · 2026-10-26')).toBeInTheDocument();
});

test('reports a server error as an alert and does not open the page body', async () => {
  server({ body: { error: '데이터베이스에 연결할 수 없습니다' }, status: 503 });
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveTextContent('데이터베이스에 연결할 수 없습니다');
  expect(document.querySelector('.legacy')).toBeNull();
});

test('each page has its own address and is marked in the main menu', async () => {
  server({ body: { today: '2026-10-26' } });
  render(<App />);
  const menu = screen.getByRole('navigation', { name: '주 메뉴' });
  for (const [label, path] of [
    ['복습', '/reviews'],
    ['교재', '/textbooks'],
    ['키워드', '/keywords'],
    ['통계', '/stats'],
    ['회고', '/retrospectives'],
    ['설정', '/settings'],
  ]) {
    fireEvent.click(within(menu).getByRole('link', { name: label }));
    expect(window.location.pathname).toBe(path);
    expect(await screen.findByRole('heading', { level: 1, name: label })).toBeInTheDocument();
    expect(within(menu).getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
  }
});

test('saving a log and completing a review update the badge, and the pages stay mounted', async () => {
  let due = 1;
  const json = (body: object) => Promise.resolve(new Response(JSON.stringify(body)));
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: { method?: string }) => {
      const method = init?.method ?? 'GET';
      if (url === '/api/health') return json({ today: '2026-10-26' });
      if (url === '/api/reviews/today/count') return json({ count: due });
      if (url === '/api/reviews/today')
        return json({
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
        });
      if (method === 'POST' && url === '/api/study-logs') {
        due = 2;
        return json({ studyLog: {} });
      }
      if (method === 'POST' && url.endsWith('/complete')) {
        due -= 1;
        return json({ next: { round: 2, dueDate: '2026-10-28' } });
      }
      if (url.startsWith('/api/study-logs?')) return json({ studyLogs: [] });
      if (url.startsWith('/api/textbooks')) return json({ textbooks: [] });
      return Promise.resolve(
        new Response(JSON.stringify({ error: '테스트 서버' }), { status: 500 }),
      );
    }),
  );
  window.history.replaceState(null, '', '/');
  render(<App />);
  await screen.findByRole('link', { name: '오늘 복습 1개' });

  const form = document.querySelector('.study-logs form')!;
  fireEvent.submit(form);
  await screen.findByRole('link', { name: '오늘 복습 2개' });
  // Counting again re-renders the app; a remounted page would lose what is being typed.
  expect(document.querySelector('.study-logs form')).toBe(form);

  const menu = screen.getByRole('navigation', { name: '주 메뉴' });
  fireEvent.click(within(menu).getByRole('link', { name: '복습' }));
  const heading = await screen.findByRole('heading', { name: '오늘의 복습 2개' });
  const card = heading.closest('section');
  fireEvent.click(screen.getAllByRole('button', { name: /복습 완료/ })[0]);
  await screen.findByRole('link', { name: '오늘 복습 1개' });
  expect(heading.closest('section')).toBe(card);
  expect(heading.isConnected).toBe(true);
});

test('an unknown address falls back to the study log', async () => {
  server({ body: { today: '2026-10-26' } });
  window.history.replaceState(null, '', '/no-such-page');
  render(<App />);
  expect(await screen.findByRole('heading', { level: 1, name: '학습 기록' })).toBeInTheDocument();
  expect(window.location.pathname).toBe('/');
});
