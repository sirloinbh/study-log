# Read the holiday API key from AWS SSM (#129)

## Purpose

The Public Data Portal key for holidays (#33) was a manual `.env` value on the PC and the server. project-standards ADR-0014 moved external service keys to AWS SSM, so the key now has one source.

## Changes

- `.env.example`: `HOLIDAY_API_KEY` is tagged `@secret @used=backend @ssm=/sirloinbh/shared/data-go-kr-service-key`. The parameter is shared because one Public Data Portal key works for every portal API (life-journal's TourAPI and KOPIS can reuse it).
- `docs/next-steps/README.md`: removed the finished "Get a Public Data Portal API key" row and said where the key comes from.

## Key

- The user applied for the Korea Astronomy and Space Science Institute special day information API on data.go.kr on 2026-11-15 and stores the decoded key with `node tools/app-secrets.mjs set /sirloinbh/shared/data-go-kr-service-key` in project-standards. The value is not written anywhere in this repository.
- PC: `node tools/app-secrets.mjs pull study-log` writes it into `.env`. Server: `deploy/remote-deploy.sh` reads the tagged key on each deploy (study-log is not deployed yet).

## Verification

- `appKeys('study-log', ...)` from project-standards `tools/app-secrets.mjs` returns `HOLIDAY_API_KEY` → `/sirloinbh/shared/data-go-kr-service-key` (the tag passes the ADR-0014 rules).
