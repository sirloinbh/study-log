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
