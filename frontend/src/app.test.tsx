import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { App } from './app';

// /api/health answers with the server date; other endpoints fail, so pages show their own errors.
function server(health: { body: object; status?: number }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url === '/api/health'
        ? new Response(JSON.stringify(health.body), { status: health.status ?? 200 })
        : new Response(JSON.stringify({ error: '테스트 서버' }), { status: 500 }),
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

test('an unknown address falls back to the study log', async () => {
  server({ body: { today: '2026-10-26' } });
  window.history.replaceState(null, '', '/no-such-page');
  render(<App />);
  expect(await screen.findByRole('heading', { level: 1, name: '학습 기록' })).toBeInTheDocument();
  expect(window.location.pathname).toBe('/');
});
