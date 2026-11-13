# Study Log PostgreSQL

PostgreSQL 17. The only source of migrations is `migrations/NNN_<description>.sql`. On an empty Docker volume, all files are applied automatically by name order on first start, and CI also applies all files in order.

On an existing DB, only the files that have not been applied yet are applied with the migration tool. The deployment (`deploy/remote-deploy.sh`) does the same with `node dist/migrate.js` before it starts the new version, and stops if that fails.

```powershell
npm run db:migrate -w backend
```

It uses `DATABASE_URL`. It reads the value from `.env` at the repository root, but a value already set in the shell takes precedence, so check which DB it targets. The applied history is kept in the `schema_migrations` table.

- A file and its record are committed together. If a file fails, only that file is rolled back and the run stops; the records of earlier files stay.
- If you edit or delete a file that was already applied, the tool refuses to run. Write the change as a new numbered file.
- A DB without records (one where files were applied by hand before this table existed, or one auto-applied from an empty volume) runs all files once more on the first run. This is safe because every migration is safe to re-run under the rule below.

When you must apply a file in the container by hand, use `psql -f`. A file applied this way leaves no record, so it runs again on the next run. Do not pipe it through PowerShell, as in `Get-Content … | docker compose exec … psql`. Windows PowerShell 5.1 sends ASCII to external programs, so Korean text turns into `?`.

Rule: write every migration so it is safe to re-run. Reserve the number when you start a parallel branch. Keep the meaning of existing data, and leave values you could not confirm as NULL. For Korean literals in SQL, prefer the `U&'\XXXX'` escape.
