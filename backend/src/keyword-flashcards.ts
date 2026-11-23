import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { auditChange } from './audit-log.js';
import { calendarDate } from './dates.js';
import { inTransaction } from './sql.js';
import { parseId } from './standard/http.js';

const cardDate = calendarDate(
  z.string({ error: 'The date format is invalid' }),
  'The date must be in YYYY-MM-DD format',
);

// ?date is the review day; left out it is today.
export const flashcardQuery = z.object({ date: cardDate.optional() });

export const flashcardAnswer = z.object(
  {
    date: cardDate.optional(),
    known: z.boolean({ error: 'Send known as true or false' }),
  },
  { error: 'Send the answer as a JSON object' },
);

const notFound = { error: 'Keyword not found' };

// The flashcards of a day: the keywords noted on the study date of every study log with an open
// review due by that day (docs/decisions/review-rules.md), so overdue reviews count too. Keywords
// last answered "not known" come first, then those never answered, then the known ones; only
// answers before the day count, so the order does not shuffle while the day's cards are answered.
const cardsSql = `
  SELECT k.id, k.keyword_date AS date, k.keyword, k.memo, today.known
  FROM keywords k
  LEFT JOIN keyword_cards today ON today.keyword_id = k.id AND today.card_date = $1
  WHERE k.keyword_date IN (
    SELECT l.study_date FROM reviews r JOIN study_logs l ON l.id = r.study_log_id
    WHERE r.completed_on IS NULL AND r.due_date <= $1
  )
  ORDER BY COALESCE((
    SELECT CASE WHEN p.known THEN 2 ELSE 0 END FROM keyword_cards p
    WHERE p.keyword_id = k.id AND p.card_date < $1 ORDER BY p.card_date DESC LIMIT 1
  ), 1), k.keyword_date, k.id`;

export function flashcardRoutes(pool: Pool, today: () => string) {
  const router = Router();

  router.get('/', async (req, res) => {
    const date = flashcardQuery.parse(req.query).date ?? today();
    const { rows } = await pool.query(cardsSql, [date]);
    res.json({ date, cards: rows });
  });

  router.put('/:keywordId', async (req, res) => {
    const id = parseId(req.params.keywordId, 'keyword');
    const input = flashcardAnswer.parse(req.body);
    const date = input.date ?? today();
    const answered = await inTransaction(pool, async (client) => {
      const saved = await client.query(
        `INSERT INTO keyword_cards (keyword_id, card_date, known)
         SELECT id, $2, $3 FROM keywords WHERE id = $1
         ON CONFLICT (keyword_id, card_date)
         DO UPDATE SET known = EXCLUDED.known, answered_at = now()
         RETURNING keyword_id AS id, card_date AS date, known`,
        [id, date, input.known],
      );
      if (saved.rows.length > 0)
        await auditChange(req, res, client, 'update', 'keyword_card', id, {
          date,
          known: input.known,
        });
      return saved.rows[0] as { id: number; date: string; known: boolean } | undefined;
    });
    if (!answered) return void res.status(404).json(notFound);
    res.json({ card: answered });
  });

  return router;
}
