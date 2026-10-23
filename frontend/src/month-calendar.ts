export type CalendarDay = { date: string; minutes: number; logs: number };

// "2026-10" moved by `delta` months.
export function shiftMonth(month: string, delta: number) {
  const [year, number] = month.split('-').map(Number);
  const moved = new Date(Date.UTC(year, number - 1 + delta, 1));
  return moved.toISOString().slice(0, 7);
}

export const monthTitle = (month: string) =>
  `${Number(month.slice(0, 4))}년 ${Number(month.slice(5, 7))}월`;

// The month's days in rows of seven, Sunday first (#96); the slots before the 1st are null.
export function calendarCells(days: CalendarDay[]) {
  if (days.length === 0) return [];
  const weekday = new Date(`${days[0].date}T00:00:00Z`).getUTCDay();
  return [...Array<null>(weekday).fill(null), ...days];
}

// A short amount for a small day cell: "45분", "1.5시간", "2시간"; nothing for no study.
export function shortMinutes(minutes: number) {
  if (minutes <= 0) return '';
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours}시간`;
}
