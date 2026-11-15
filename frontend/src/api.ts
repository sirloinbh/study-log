// Carries the HTTP status so callers can tell "already gone" (404) from other failures.
export class RequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

// Resolves with the JSON body (undefined for 204) or rejects with the API's error message.
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
    throw new RequestError('Cannot reach the server');
  }
  return reply<T>(response);
}

// Sends a file with its form fields as multipart and resolves like requestJson (#30). The header
// marks the app's own request; the API refuses file requests without it.
export async function requestForm<T>(path: string, form: FormData): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'x-requested-with': 'study-log' },
      body: form,
    });
  } catch {
    throw new RequestError('Cannot reach the server');
  }
  return reply<T>(response);
}

async function reply<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok)
    throw new RequestError(data.error ?? 'Could not process the request', response.status);
  return data as T;
}
