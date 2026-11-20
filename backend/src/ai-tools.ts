// The AI tools of Study Log (project-standards#711, ADR-0017). shared-ai lists and calls them over /internal/tools;
// standard/tools.ts checks the signed call, the scope, and writes the audit row.
import { z } from 'zod/v4';

import { calendarDate } from './dates.js';
import { defineTool } from './standard/tools.js';
import { type Db, listStudyLogs } from './study-logs.js';

const day = calendarDate(z.string(), 'Use the YYYY-MM-DD format');

// A tool never returns the whole history: at most 100 logs per call, newest first.
const listInput = z.object({
  from: day.optional(),
  to: day.optional(),
  textbookId: z.int().min(1).optional(),
  limit: z.int().min(1).max(100).default(20),
});

export const tools = [
  defineTool({
    name: 'list_study_logs',
    description:
      'List the study logs (at most 100, default 20), newest first, with textbook, chapter, minutes, status, understanding, memo and difficulties. Optionally only a date range (YYYY-MM-DD) or one textbook.',
    input: listInput,
    access: 'read',
    action: 'read',
    entity: 'study_log',
    run: async (input, { db }: { db: Db }) => ({
      result: await listStudyLogs(db, { ...input, date: undefined, q: undefined }),
    }),
  }),
];
