export type Site = 'baekjoon' | 'leetcode' | 'other';
export type Result = 'solved' | 'partial' | 'failed';

export const siteLabels: Record<Site, string> = {
  baekjoon: 'Baekjoon',
  leetcode: 'LeetCode',
  other: 'Other',
};
export const resultLabels: Record<Result, string> = {
  solved: 'Solved',
  partial: 'Partly solved',
  failed: 'Not solved',
};

export type Attempt = {
  id: number;
  date: string;
  result: Result;
  language: string;
  minutes: number | null;
  notes: string;
  studyLogId: number | null;
};

export type ProblemRow = {
  id: number;
  site: Site;
  problemKey: string;
  title: string;
  url: string | null;
  // From solved.ac for Baekjoon problems (#369).
  level: number | null;
  tags: string[];
  attemptCount: number;
  totalMinutes: number;
  lastAttemptDate: string | null;
  lastResult: Result | null;
};

// Same limits as the API; the server still validates.
export const codingLimits = { key: 100, title: 200, url: 500, language: 30, notes: 5000 } as const;

// What the attempt fields hold while typing: text, turned into the request by `attemptBody`.
export type AttemptDraft = {
  date: string;
  result: Result;
  language: string;
  minutes: string;
  notes: string;
  logOn: boolean;
  startTime: string;
};

export const emptyAttempt = (date: string): AttemptDraft => ({
  date,
  result: 'solved',
  language: '',
  minutes: '',
  notes: '',
  logOn: false,
  startTime: '',
});

export const draftOf = (attempt: Attempt): AttemptDraft => ({
  date: attempt.date,
  result: attempt.result,
  language: attempt.language,
  minutes: attempt.minutes === null ? '' : String(attempt.minutes),
  notes: attempt.notes,
  logOn: false,
  startTime: '',
});

// A message when the draft cannot be sent, so the form says why before asking the server.
export function attemptIssue(draft: AttemptDraft, withLog = true) {
  const minutes = draft.minutes.trim();
  if (minutes && !/^\d+$/.test(minutes)) return 'The minutes must be a whole number from 1 to 1439';
  if (minutes && (Number(minutes) < 1 || Number(minutes) > 1439))
    return 'The minutes must be a whole number from 1 to 1439';
  if (withLog && draft.logOn && !minutes) return 'Enter the minutes to also record a study log';
  if (withLog && draft.logOn && !draft.startTime) return 'Enter the start time of the study log';
  return undefined;
}

export function attemptBody(draft: AttemptDraft, withLog = true) {
  const minutes = draft.minutes.trim();
  return {
    date: draft.date,
    result: draft.result,
    language: draft.language,
    minutes: minutes ? Number(minutes) : null,
    notes: draft.notes,
    ...(withLog && draft.logOn ? { studyLog: { startTime: draft.startTime } } : {}),
  };
}

export type Filters = { site: '' | Site; result: '' | Result; q: string };

export function listPath(filters: Filters) {
  const params = [
    ['site', filters.site],
    ['result', filters.result],
    ['q', filters.q.trim()],
  ].filter(([, value]) => value);
  const query = params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
  return query ? `/api/coding/problems?${query}` : '/api/coding/problems';
}

const tiers = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ruby'];
const numerals = ['I', 'II', 'III', 'IV', 'V'];

// The solved.ac tier of a level: 1 is Bronze V, 5 is Bronze I, 6 is Silver V ... 30 is Ruby I.
export function tierLabel(level: number | null) {
  if (level === null) return undefined;
  if (level === 0) return 'Unrated';
  if (level > 30) return 'Master';
  return `${tiers[Math.floor((level - 1) / 5)]} ${numerals[4 - ((level - 1) % 5)]}`;
}

export type SolvedProblem = {
  id: number;
  title: string;
  level: number;
  tags: string[];
  url: string;
};
export type ImportResult = { added: number; skipped: number; total: number };
