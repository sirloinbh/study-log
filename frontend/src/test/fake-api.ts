import { afterEach, expect, vi } from 'vitest';

// The one place that replaces `fetch` in screen tests (#277). Every test file describes the server
// with per-path handlers, and a request no handler answers is a test failure, not a made-up reply.

export type Sent = {
  method: string;
  path: string;
  body?: unknown;
  // A multipart upload (FormData) is kept as is instead of a JSON body.
  form?: FormData;
  headers?: Record<string, string>;
};
export type Answer = {
  status?: number;
  body?: unknown;
  // The reply waits for this promise first (a slow server, or a request the test settles later).
  hold?: Promise<unknown>;
  // The request never settles on its own unless it is aborted (a request that is still in flight).
  fail?: 'network';
};
export type Handler = (request: Sent) => Answer | undefined | Promise<Answer | undefined>;
// `'GET /api/textbooks'` matches that method and path (query string ignored); `'/api/health'`
// matches any method. A value is a fixed answer or a function of the request.
export type Routes = Record<string, Answer | ((request: Sent) => Answer | Promise<Answer>)>;

export type Api = {
  // Every request except a plain read, in order.
  sent: Sent[];
  // Every request including reads, in order.
  requests: Sent[];
  // Resolves when a request matching `match` has been made (waits on the recorded requests).
  requested: (match: (request: Sent) => boolean) => Promise<Sent>;
  // Requests no handler answered; a test that has any fails in afterEach.
  unexpected: Sent[];
};

let live: Api | undefined;

afterEach(() => {
  const api = live;
  live = undefined;
  if (api) {
    expect(
      api.unexpected.map((r) => `${r.method} ${r.path}`),
      'requests no fake handler answered',
    ).toEqual([]);
  }
});

const pathname = (path: string) => path.split('?')[0];

function toHandler(source: Handler | Routes): Handler {
  if (typeof source === 'function') return source;
  return (request) => {
    const key = `${request.method} ${pathname(request.path)}`;
    const hit = source[key] ?? source[pathname(request.path)];
    return typeof hit === 'function' ? hit(request) : hit;
  };
}

const backgroundAnswers: Record<string, Answer> = {
  // The algorithm goals of the day log (#426): none.
  '/api/coding/goals/today': { body: { date: '', lists: [] } },
  '/api/stats/goal': {
    body: {
      weekStart: '2026-10-18',
      weekEnd: '2026-10-24',
      goalMinutes: null,
      goalSince: null,
      studiedMinutes: 0,
      achievementRate: null,
      streakDays: 0,
      studiedToday: false,
    },
  },
};

export function fakeApi(source: Handler | Routes): Api {
  const handle = toHandler(source);
  const api: Api = {
    sent: [],
    requests: [],
    unexpected: [],
    requested: (match) =>
      vi.waitFor(() => {
        const found = api.requests.find(match);
        if (!found) throw new Error('request not made yet');
        return found;
      }),
  };
  live = api;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (
        path: string,
        init?: {
          method?: string;
          body?: string | FormData;
          headers?: Record<string, string>;
          signal?: AbortSignal;
        },
      ) => {
        const method = init?.method ?? 'GET';
        const request: Sent = {
          method,
          path,
          ...(init?.body instanceof FormData
            ? { form: init.body, ...(init.headers ? { headers: init.headers } : {}) }
            : init?.body
              ? { body: JSON.parse(init.body) as unknown }
              : {}),
        };
        api.requests.push(request);
        if (method !== 'GET') api.sent.push(request);
        // Cards that sit on a page next to what a test is about: a test with no handler for them sees
        // no goal.
        const answer =
          (await handle(request)) ??
          (method === 'GET'
            ? (backgroundAnswers[path] ?? backgroundAnswers[pathname(path)])
            : undefined);
        if (!answer) {
          api.unexpected.push(request);
          throw new TypeError(`Unexpected request: ${method} ${path}`);
        }
        if (answer.fail === 'network') throw new TypeError('Failed to fetch');
        if (answer.hold) await answer.hold;
        const { status = 200, body } = answer;
        return new Response(status === 204 ? null : JSON.stringify(body ?? {}), { status });
      },
    ),
  );
  return api;
}
