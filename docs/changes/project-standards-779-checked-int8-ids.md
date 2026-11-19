# Use the shared checked int8 parser (project-standards#779)

- `app.ts` calls `setInt8Parser(types)` from `standard/db.ts` instead of its own type 20 parser.
- Behavior: BIGINT ids are numbers and a value above 2^53 throws (life-journal's plain `Number` rounded silently before).
- Convention: ADR-0025 and `docs/conventions/pg-ids-and-rows.md` in sirloinbh/project-standards.
- Verification: typecheck, eslint and prettier on `backend/src/app.ts`; CI runs the full suite.
