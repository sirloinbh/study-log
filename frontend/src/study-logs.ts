import { contentLabel } from './textbook';

export type StudyStatus = 'planned' | 'in_progress' | 'done' | 'stopped';

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
};

export type StudyLogForm = Pick<
  StudyLog,
  'studyDate' | 'startTime' | 'endTime' | 'memo' | 'status' | 'textbookId' | 'contentId'
>;

// "선형대수 · 1.2 내적" for a log linked to a textbook (and chapter); empty otherwise.
export function studiedLabel(log: StudyLog) {
  if (log.textbookTitle === null) return '';
  if (log.contentTitle === null) return log.textbookTitle;
  return `${log.textbookTitle} · ${contentLabel({ number: log.contentNumber ?? '', title: log.contentTitle })}`;
}

export const statusLabels: Record<StudyStatus, string> = {
  planned: '계획',
  in_progress: '진행 중',
  done: '완료',
  stopped: '중단',
};

export const emptyForm = (studyDate: string): StudyLogForm => ({
  studyDate,
  startTime: '',
  endTime: '',
  memo: '',
  status: 'planned',
  textbookId: null,
  contentId: null,
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
  if (hours === 0) return `${minutes}분`;
  return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
}
