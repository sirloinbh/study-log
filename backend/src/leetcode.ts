import { z } from 'zod/v4';

// LeetCode reads for the coding problem log (#370). LeetCode has no official API: this uses the
// public GraphQL endpoint its own site uses, without signing in, so only what a public profile
// shows is available: the most recent accepted submissions (about 20) and a problem's difficulty.
// The client takes `fetch` so tests hand in a stand-in and never call the site.
export type RecentAccepted = { slug: string; title: string; timestamp: number };
export const leetCodeDifficulties = ['Easy', 'Medium', 'Hard'] as const;
export type LeetCodeClient = {
  // Newest first, as LeetCode lists them.
  recentAccepted: (username: string) => Promise<RecentAccepted[]>;
  // undefined when LeetCode has no such problem.
  difficulty: (slug: string) => Promise<(typeof leetCodeDifficulties)[number] | undefined>;
};

// The message is shown to the person, so it never holds more than what went wrong.
export class LeetCodeError extends Error {
  readonly status = 503;
}

const endpoint = 'https://leetcode.com/graphql';
const timeoutMs = 10_000;
const unreadable = 'LeetCode sent an answer this app cannot read';
// LeetCode user names are letters, digits, and a few separators.
export const leetCodeUsername = /^[A-Za-z0-9_.-]{1,40}$/;
export const leetCodeSlug = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const recent = z.object({
  data: z.object({
    recentAcSubmissionList: z
      .array(
        z.object({
          title: z.string().transform((title) => title.trim().slice(0, 200)),
          titleSlug: z.string().max(100).regex(leetCodeSlug),
          timestamp: z.union([
            z.number(),
            z
              .string()
              .regex(/^\d{1,12}$/)
              .transform(Number),
          ]),
        }),
      )
      .max(100)
      // A user that does not exist or hides its profile is answered with null or an empty list.
      .nullable(),
  }),
});
const question = z.object({
  data: z.object({
    question: z.object({ difficulty: z.enum(leetCodeDifficulties) }).nullable(),
  }),
});

async function ask(fetchImpl: typeof fetch, query: string, variables: object) {
  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'user-agent': 'study-log (personal study tracker)',
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new LeetCodeError('Could not reach LeetCode. Try again in a moment');
  }
  if (response.status === 429)
    throw new LeetCodeError('LeetCode asked to slow down. Try again in a few minutes');
  if (!response.ok)
    throw new LeetCodeError(`LeetCode did not answer the request (status ${response.status})`);
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new LeetCodeError(unreadable);
  }
}

export function leetCodeClient(fetchImpl: typeof fetch = fetch): LeetCodeClient {
  return {
    recentAccepted: async (username) => {
      const body = await ask(
        fetchImpl,
        `query ($username: String!, $limit: Int) {
           recentAcSubmissionList(username: $username, limit: $limit) { title titleSlug timestamp }
         }`,
        { username, limit: 50 },
      );
      const parsed = recent.safeParse(body);
      if (!parsed.success) throw new LeetCodeError(unreadable);
      return (parsed.data.data.recentAcSubmissionList ?? []).map((item) => ({
        slug: item.titleSlug,
        title: item.title || item.titleSlug,
        timestamp: item.timestamp,
      }));
    },
    difficulty: async (slug) => {
      const body = await ask(
        fetchImpl,
        `query ($titleSlug: String!) { question(titleSlug: $titleSlug) { difficulty } }`,
        { titleSlug: slug },
      );
      const parsed = question.safeParse(body);
      if (!parsed.success) throw new LeetCodeError(unreadable);
      return parsed.data.data.question?.difficulty;
    },
  };
}
