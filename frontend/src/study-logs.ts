export type StudyStatus = 'planned' | 'in_progress' | 'done' | 'stopped';

export type StudyLog = {
  id: number;
  studyDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  memo: string;
  status: StudyStatus;
};

export type StudyLogForm = Omit<StudyLog, 'id' | 'durationMinutes'>;

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

// Carries the HTTP status so callers can tell "already gone" (404) from other failures.
export class RequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

// Resolves with the JSON body (undefined for 204) or rejects with the API's Korean message.
export async function requestJson<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method ?? 'GET',
      headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new RequestError('서버에 연결할 수 없습니다');
  }
  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok)
    throw new RequestError(data.error ?? '요청을 처리하지 못했습니다', response.status);
  return data as T;
}
