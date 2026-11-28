import { useEffect, useState } from 'react';

import { serviceToday } from './lib/format';

// The service date is the calendar date in Asia/Seoul (AGENTS.md), whatever the browser's own time
// zone is. The pages compute it here instead of waiting for /api/health, and recompute it when the
// tab is used again and at midnight, so a tab left open overnight does not keep yesterday.
const seoulOffsetMs = 9 * 60 * 60 * 1000; // no daylight saving time

// "YYYY-MM-DD" in Asia/Seoul.
export const serviceDate = (now: Date = new Date()): string => serviceToday(now);

// Milliseconds from `now` until the next midnight in Asia/Seoul.
export function msUntilMidnight(now: Date = new Date()): number {
  const day = 24 * 60 * 60 * 1000;
  const local = now.getTime() + seoulOffsetMs;
  return day - (((local % day) + day) % day);
}

// The service date, kept current: it changes at midnight and on focus or when the tab is shown.
export function useServiceDate(): string {
  const [today, setToday] = useState(() => serviceDate());
  useEffect(() => {
    const refresh = () => setToday(serviceDate());
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      // A little after midnight, so the clock has certainly moved to the next day.
      timer = setTimeout(() => {
        refresh();
        schedule();
      }, msUntilMidnight() + 1000);
    };
    schedule();
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        refresh();
        // A sleeping laptop may have stopped the timer; schedule it again from the new time.
        clearTimeout(timer);
        schedule();
      }
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return today;
}
