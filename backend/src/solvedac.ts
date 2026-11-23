import { z } from 'zod/v4';

// solved.ac reads for the coding problem log (#369): one problem by its Baekjoon number, and the
// problems a handle has solved. The client takes `fetch` so tests hand in a stand-in and never call
// the site. Answers are checked strictly with length limits (as for holidays, #175); a title that
// is too long is cut, since one odd problem should not fail a whole import.
export type SolvedProblem = { id: number; title: string; level: number; tags: string[] };
export type SolvedAcClient = {
  // undefined when solved.ac has no such problem.
  problem: (id: number) => Promise<SolvedProblem | undefined>;
  // One page (50 problems at most) of the problems solved by `handle`, by problem number.
  solvedPage: (handle: string, page: number) => Promise<{ total: number; items: SolvedProblem[] }>;
};

// The message is shown to the person, so it never holds more than what went wrong.
export class SolvedAcError extends Error {
  readonly status = 503;
}

const base = 'https://solved.ac/api/v3';
const timeoutMs = 10_000;
export const solvedAcPageSize = 50;
// solved.ac handles are short letters, digits and underscores.
export const solvedAcHandle = /^[A-Za-z0-9_]{1,30}$/;

const problem = z
  .object({
    problemId: z.number().int().min(1).max(9_999_999),
    titleKo: z.string().transform((title) => title.trim().slice(0, 200)),
    level: z.number().int().min(0).max(40),
    tags: z.array(z.object({ key: z.string().regex(/^[a-z0-9_]{1,50}$/) })).max(30),
  })
  .transform((raw): SolvedProblem => ({
    id: raw.problemId,
    title: raw.titleKo || `Baekjoon ${raw.problemId}`,
    level: raw.level,
    tags: raw.tags.map((tag) => tag.key),
  }));
const page = z.object({
  count: z.number().int().min(0).max(1_000_000),
  items: z.array(problem).max(100),
});

async function read(fetchImpl: typeof fetch, path: string) {
  let response: Response;
  try {
    response = await fetchImpl(`${base}${path}`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        accept: 'application/json',
        'user-agent': 'study-log (personal study tracker)',
      },
    });
  } catch {
    throw new SolvedAcError('Could not reach solved.ac. Try again in a moment');
  }
  if (response.status === 404) return undefined;
  if (response.status === 429)
    throw new SolvedAcError('solved.ac asked to slow down. Try again in a few minutes');
  if (!response.ok)
    throw new SolvedAcError(`solved.ac did not answer the request (status ${response.status})`);
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new SolvedAcError('solved.ac sent an answer this app cannot read');
  }
}

export function solvedAcClient(fetchImpl: typeof fetch = fetch): SolvedAcClient {
  return {
    problem: async (id) => {
      const body = await read(fetchImpl, `/problem/show?problemId=${id}`);
      if (body === undefined) return undefined;
      const parsed = problem.safeParse(body);
      if (!parsed.success) throw new SolvedAcError('solved.ac sent an answer this app cannot read');
      // The answer must be for the problem that was asked for.
      if (parsed.data.id !== id)
        throw new SolvedAcError('solved.ac sent an answer this app cannot read');
      return parsed.data;
    },
    solvedPage: async (handle, number) => {
      const query = encodeURIComponent(`solved_by:${handle}`);
      const body = await read(
        fetchImpl,
        `/search/problem?query=${query}&sort=id&direction=asc&page=${number}`,
      );
      const parsed = page.safeParse(body);
      if (!parsed.success) throw new SolvedAcError('solved.ac sent an answer this app cannot read');
      return { total: parsed.data.count, items: parsed.data.items };
    },
  };
}
