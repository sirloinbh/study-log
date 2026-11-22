import { act, renderHook, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { App } from './app';
import { msUntilMidnight, serviceDate, useServiceDate } from './date';
import { fakeApi } from './test/fake-api';
import { render } from './test/render';

afterEach(() => {
  vi.useRealTimers();
});

test('serviceDate is the date in Asia/Seoul, not the browser time zone', () => {
  // 15:00 UTC on the 26th is midnight on the 27th in Seoul.
  expect(serviceDate(new Date('2026-10-26T14:59:59Z'))).toBe('2026-10-26');
  expect(serviceDate(new Date('2026-10-26T15:00:00Z'))).toBe('2026-10-27');
  expect(msUntilMidnight(new Date('2026-10-26T14:59:50Z'))).toBe(10_000);
});

test('the date moves on at midnight and on focus', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-26T14:59:50Z'));
  const { result } = renderHook(() => useServiceDate());
  expect(result.current).toBe('2026-10-26');
  act(() => {
    vi.advanceTimersByTime(12_000);
  });
  expect(result.current).toBe('2026-10-27');
  // A clock change while the tab was in the background shows on return.
  vi.setSystemTime(new Date('2026-10-28T03:00:00Z'));
  act(() => {
    window.dispatchEvent(new Event('focus'));
  });
  expect(result.current).toBe('2026-10-28');
});

test('Reviews still renders when the health check fails', async () => {
  fakeApi({
    'GET /api/health': { status: 503, body: { error: 'Cannot connect to the database' } },
    'GET /api/reviews/today/count': { body: { count: 0 } },
    'GET /api/reviews/today': { body: { today: '2026-10-26', reviews: [] } },
  });
  window.history.replaceState(null, '', '/reviews');
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Cannot connect to the database');
  expect(await screen.findByRole('heading', { name: /Reviews for today/ })).toBeInTheDocument();
});
