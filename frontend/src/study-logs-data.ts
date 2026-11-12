import { contentLabel } from './textbook';

export type StudyStatus = 'planned' | 'in_progress' | 'done' | 'stopped';
export type StudyType = 'new' | 'review';

export type StudyLog = {
  id: number;
  studyDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  memo: string;
  status: StudyStatus;
  textbookId: number | null;
  textbookTitle: string | null;
  contentId: number | null;
  contentNumber: string | null;
  contentTitle: string | null;
  understanding: number | null;
  difficulties: string;
  goalAchieved: boolean | null;
  studyType: StudyType;
};

export type StudyLogForm = Pick<
  StudyLog,
  | 'studyDate'
  | 'startTime'
  | 'endTime'
  | 'memo'
  | 'status'
  | 'textbookId'
  | 'contentId'
  | 'understanding'
  | 'difficulties'
  | 'goalAchieved'
  | 'studyType'
>;

// Self-assessed understanding, 1 (low) to 5 (high).
export const understandingLabels: Record<number, string> = {
  1: '1 · Barely understood',
  2: '2 · Understood a little',
  3: '3 · Average',
  4: '4 · Mostly understood',
  5: '5 · Fully understood',
};

// "Understanding 4/5 · Goal achieved" from whichever answers were given; empty when none.
export function reflectionLabel(log: Pick<StudyLog, 'understanding' | 'goalAchieved'>) {
  return [
    log.understanding === null ? '' : `Understanding ${log.understanding}/5`,
    log.goalAchieved === null ? '' : log.goalAchieved ? 'Goal achieved' : 'Goal not achieved',
  ]
    .filter(Boolean)
    .join(' · ');
}

// "Linear Algebra · 1.2 Dot product" for a log linked to a textbook (and chapter); empty otherwise.
export function studiedLabel(log: StudyLog) {
  if (log.textbookTitle === null) return '';
  if (log.contentTitle === null) return log.textbookTitle;
  return `${log.textbookTitle} · ${contentLabel({ number: log.contentNumber ?? '', title: log.contentTitle })}`;
}

export const statusLabels: Record<StudyStatus, string> = {
  planned: 'Planned',
  in_progress: 'In progress',
  done: 'Done',
  stopped: 'Stopped',
};

export const studyTypeLabels: Record<StudyType, string> = { new: 'New', review: 'Review' };

export const emptyForm = (studyDate: string): StudyLogForm => ({
  studyDate,
  startTime: '',
  endTime: '',
  memo: '',
  status: 'planned',
  textbookId: null,
  contentId: null,
  understanding: null,
  difficulties: '',
  goalAchieved: null,
  studyType: 'new',
});

const clock = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

// Same rule as the API: an end earlier than the start crossed midnight. Preview only; the
// server recalculates and stores the value.
export function previewMinutes(startTime: string, endTime: string) {
  if (!clock.test(startTime) || !clock.test(endTime) || startTime === endTime) return undefined;
  const minutes = minutesOf(endTime) - minutesOf(startTime);
  return minutes < 0 ? minutes + 24 * 60 : minutes;
}

export const crossesMidnight = (startTime: string, endTime: string) =>
  clock.test(startTime) && clock.test(endTime) && endTime < startTime;

export function formatMinutes(total: number) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

export type StudyLogSearch = { q: string; from: string; to: string; textbookId: string };

export const emptySearch = (): StudyLogSearch => ({ q: '', from: '', to: '', textbookId: '' });

// The list request for a search (#18): blank conditions are left out, up to 100 results.
export function studyLogSearchPath(search: StudyLogSearch) {
  const params = [
    ['q', search.q.trim()],
    ['from', search.from],
    ['to', search.to],
    ['textbookId', search.textbookId],
    ['limit', '100'],
  ].filter(([, value]) => value);
  return `/api/study-logs?${params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')}`;
}
