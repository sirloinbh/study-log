import { vi } from 'vitest';

type Sent = { method: string; path: string; body?: unknown };
type Answer = { status?: number; body?: unknown };

// Stands in for the server in screen tests: `answer` gives each request's reply, and every request
// other than a plain read is kept in `sent` to check what the screen asked for.
export function fakeApi(answer: (request: Sent) => Answer) {
  const sent: Sent[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string, init?: { method?: string; body?: string }) => {
      const method = init?.method ?? 'GET';
      const request: Sent = {
        method,
        path,
        ...(init?.body ? { body: JSON.parse(init.body) as unknown } : {}),
      };
      if (method !== 'GET') sent.push(request);
      const { status = 200, body } = answer(request);
      return Promise.resolve(
        new Response(status === 204 ? null : JSON.stringify(body ?? {}), { status }),
      );
    }),
  );
  return sent;
}
