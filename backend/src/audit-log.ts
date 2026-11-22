import type { Request, Response } from 'express';

import { auditContext, type AuditDb, writeAudit } from './standard/audit.js';

// One audit_log row for a change made through the HTTP API (#263), written with the client of the
// change's own transaction. Callers pass a short summary (ids, titles), never memo or answer text;
// `omit` drops those keys if one slips in.
const privateText = ['memo', 'body', 'difficulties', 'understanding', 'answer', 'translation'];

export const auditChange = (
  req: Request,
  res: Response,
  db: AuditDb,
  action: 'create' | 'update' | 'delete',
  entity: string,
  entityId: string | number | null,
  summary: Record<string, unknown>,
) =>
  writeAudit(db, {
    ...auditContext(req, res),
    action,
    entity,
    entityId,
    [action === 'delete' ? 'before' : 'after']: summary,
    omit: privateText,
  });
