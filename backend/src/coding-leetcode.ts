import { Router } from 'express';
import type { Pool } from 'pg';

import { auditChange } from './audit-log.js';
import { defaultUrl } from './coding-problems.js';
import {
  type LeetCodeClient,
  LeetCodeError,
  leetCodeUsername,
  type RecentAccepted,
} from './leetcode.js';
import { inTransaction } from './sql.js';
import { HttpError, serviceDate } from './standard/http.js';

const unavailable = (error: unknown) => {
  if (error instanceof LeetCodeError) throw new HttpError(503, error.message);
  throw error;
};

// /api/coding/leetcode (#370): import the user's recent accepted submissions. One problem is one
// row, found by its title slug, so a problem accepted several times, or imported again, adds
// nothing. A new problem gets one "solved" attempt dated by its submission in the service time zone.
export function leetCodeRoutes(
  pool: Pool,
  client: LeetCodeClient,
  username: () => string | undefined,
) {
  const router = Router();

  router.post('/import', async (req, res) => {
    const name = username()?.trim();
    if (!name)
      throw new HttpError(
        503,
        'The LeetCode username (LEETCODE_USERNAME) is not set on the server',
      );
    if (!leetCodeUsername.test(name))
      throw new HttpError(
        503,
        'The LeetCode username (LEETCODE_USERNAME) on the server is not valid',
      );

    // Everything is read before the database is used. Oldest first, one submission per problem:
    // the first accepted one is the date the problem was solved.
    const listed = await client.recentAccepted(name).catch(unavailable);
    const first = new Map<string, RecentAccepted>();
    for (const item of [...listed].sort((a, b) => a.timestamp - b.timestamp))
      if (!first.has(item.slug)) first.set(item.slug, item);
    const slugs = [...first.keys()];
    const { rows: known } = await pool.query<{ key: string }>(
      `SELECT problem_key AS key FROM coding_problems WHERE site = 'leetcode' AND problem_key = ANY($1)`,
      [slugs],
    );
    const recorded = new Set(known.map((row) => row.key));
    const fresh = [...first.values()].filter((item) => !recorded.has(item.slug));
    // A failed lookup stops the run before anything is saved; running it again is safe.
    const difficulty = new Map<string, string | undefined>();
    for (const item of fresh)
      difficulty.set(item.slug, await client.difficulty(item.slug).catch(unavailable));

    const added = await inTransaction(pool, async (db) => {
      let count = 0;
      for (const item of fresh) {
        const { rows } = await db.query<{ id: number }>(
          `INSERT INTO coding_problems (site, problem_key, title, url, difficulty)
           VALUES ('leetcode', $1, $2, $3, $4)
           ON CONFLICT (site, problem_key) DO NOTHING RETURNING id`,
          [
            item.slug,
            item.title,
            defaultUrl('leetcode', item.slug),
            difficulty.get(item.slug) ?? null,
          ],
        );
        if (!rows[0]) continue;
        await db.query(
          `INSERT INTO coding_attempts (problem_id, attempt_date, result) VALUES ($1, $2, 'solved')`,
          [rows[0].id, serviceDate(new Date(item.timestamp * 1000))],
        );
        count++;
      }
      if (count > 0)
        await auditChange(req, res, db, 'create', 'coding_problem', null, {
          source: 'leetcode',
          added: count,
        });
      return count;
    });
    res.json({ added, skipped: first.size - added, total: first.size });
  });

  return router;
}
