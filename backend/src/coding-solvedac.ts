import { Router } from 'express';
import type { Pool } from 'pg';

import { auditChange } from './audit-log.js';
import { defaultUrl } from './coding-problems.js';
import {
  type SolvedAcClient,
  SolvedAcError,
  solvedAcHandle,
  solvedAcPageSize,
  type SolvedProblem,
} from './solvedac.js';
import { inTransaction } from './sql.js';
import { HttpError } from './standard/http.js';

// A run reads at most this many pages (5,000 problems); solved.ac allows far more requests than
// that in its window. A handle with more problems is imported by running it again: each run
// starts at the first problem and skips the ones already recorded, so it only adds.
const maxPages = 100;
const chunk = 1000;

const unavailable = (error: unknown) => {
  if (error instanceof SolvedAcError) throw new HttpError(503, error.message);
  throw error;
};

// /api/coding/solvedac (#369): the lookup that fills the form, and the import of solved problems.
export function solvedAcRoutes(
  pool: Pool,
  client: SolvedAcClient,
  handle: () => string | undefined,
) {
  const router = Router();

  router.get('/problems/:number', async (req, res) => {
    const number = req.params.number;
    if (!/^[1-9]\d{0,6}$/.test(number))
      throw new HttpError(400, 'A Baekjoon problem number is digits only, like 1000');
    const found = await client.problem(Number(number)).catch(unavailable);
    if (!found) return void res.status(404).json({ error: 'solved.ac has no such problem' });
    res.json({ problem: { ...found, url: defaultUrl('baekjoon', number) } });
  });

  router.post('/import', async (req, res) => {
    const name = handle()?.trim();
    if (!name)
      throw new HttpError(503, 'The solved.ac handle (SOLVEDAC_HANDLE) is not set on the server');
    if (!solvedAcHandle.test(name))
      throw new HttpError(503, 'The solved.ac handle (SOLVEDAC_HANDLE) on the server is not valid');

    // Read everything first, so the database is not held open while solved.ac answers.
    const solved: SolvedProblem[] = [];
    for (let number = 1; number <= maxPages; number++) {
      const { total, items } = await client.solvedPage(name, number).catch(unavailable);
      solved.push(...items);
      if (items.length < solvedAcPageSize || solved.length >= total) break;
    }
    const unique = [...new Map(solved.map((item) => [item.id, item])).values()];

    const added = await inTransaction(pool, async (db) => {
      let count = 0;
      for (let from = 0; from < unique.length; from += chunk) {
        const part = unique.slice(from, from + chunk);
        const { rowCount } = await db.query(
          `INSERT INTO coding_problems (site, problem_key, title, url, level, tags)
           SELECT 'baekjoon', k, t, 'https://www.acmicpc.net/problem/' || k, l,
             COALESCE(string_to_array(NULLIF(g, ''), ','), '{}')
           FROM unnest($1::text[], $2::text[], $3::int[], $4::text[]) AS p(k, t, l, g)
           ON CONFLICT (site, problem_key) DO NOTHING`,
          [
            part.map((item) => String(item.id)),
            part.map((item) => item.title),
            part.map((item) => item.level),
            part.map((item) => item.tags.join(',')),
          ],
        );
        count += rowCount ?? 0;
      }
      if (count > 0)
        await auditChange(req, res, db, 'create', 'coding_problem', null, {
          source: 'solved.ac',
          added: count,
        });
      return count;
    });
    res.json({ added, skipped: unique.length - added, total: unique.length });
  });

  return router;
}
