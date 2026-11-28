// The answer of GET /api/stats/finished-contents (#481) for the dashboard tests; a test passes only
// what it looks at.
export const finishedStats = (over: Record<string, unknown> = {}) => ({
  period: 'week',
  textbookId: null,
  from: '2026-10-25',
  to: '2026-10-31',
  totalChapters: 4,
  totalSections: 6,
  chapters: 0,
  sections: 0,
  todayChapters: 0,
  todaySections: 0,
  cumulativeChapters: 0,
  cumulativeSections: 0,
  days: 7,
  daily: [] as { date: string; chapters: number; sections: number }[],
  weekly: [] as { weekStart: string; chapters: number; sections: number }[],
  monthly: [] as { month: string; chapters: number; sections: number }[],
  ...over,
});

// The answer of GET /api/stats/finished-days, empty by default.
export const finishedDays = (
  daily: { date: string; chapters: number; sections: number }[] = [],
) => ({
  from: '2026-10-25',
  to: '2026-10-31',
  daily,
});
