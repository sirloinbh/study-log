export type RetrospectiveKind = 'weekly' | 'monthly';

export type Retrospective = {
  id: number;
  kind: RetrospectiveKind;
  from: string;
  to: string;
  body: string;
  updatedAt: string;
};

export type RetrospectiveSummary = {
  totalMinutes: number;
  studyDays: number;
  logs: number;
  goalsAchieved: number;
  goalsChecked: number;
};

// The response of GET /api/retrospectives/period (#19).
export type RetrospectivePeriod = {
  kind: RetrospectiveKind;
  from: string;
  to: string;
  retrospective: Retrospective | null;
  summary: RetrospectiveSummary;
};

export const kindLabels: Record<RetrospectiveKind, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
};

// Same limit as the API; the server still validates.
export const retrospectiveLimit = 20000;

export const shiftDays = (day: string, days: number) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

// A date in the period `delta` periods away from the one starting at `from`.
export function shiftPeriod(kind: RetrospectiveKind, from: string, delta: number) {
  if (kind === 'weekly') return shiftDays(from, 7 * delta);
  const [year, month] = from.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + delta, 1)).toISOString().slice(0, 10);
}

const monthDay = (day: string, withYear = false) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });

// "Oct 18 – Oct 24, 2026" for a week (Sunday to Saturday), "October 2026" for a month.
export function periodTitle(kind: RetrospectiveKind, from: string, to: string) {
  if (kind === 'monthly') {
    return new Date(`${from}T00:00:00Z`).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  const sameYear = to.slice(0, 4) === from.slice(0, 4);
  return `${monthDay(from, !sameYear)} – ${monthDay(to, true)}`;
}
