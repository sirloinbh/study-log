export type CalendarDay = { date: string; minutes: number; logs: number };

// "2026-10" moved by `delta` months.
export function shiftMonth(month: string, delta: number) {
  const [year, number] = month.split('-').map(Number);
  const moved = new Date(Date.UTC(year, number - 1 + delta, 1));
  return moved.toISOString().slice(0, 7);
}

export const monthTitle = (month: string) =>
  new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1),
  ).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

// The month's days in rows of seven, Sunday first (#96); the slots before the 1st are null.
export function calendarCells(days: CalendarDay[]) {
  if (days.length === 0) return [];
  const weekday = new Date(`${days[0].date}T00:00:00Z`).getUTCDay();
  return [...Array<null>(weekday).fill(null), ...days];
}

// A short amount for a small day cell: "45 min", "1.5 h", "2 h"; nothing for no study.
export function shortMinutes(minutes: number) {
  if (minutes <= 0) return '';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} h`;
}
