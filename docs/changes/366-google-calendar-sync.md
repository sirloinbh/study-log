# #366 One-way sync of schedules and reviews to a Google calendar

Issue: https://github.com/sirloinbh/study-log/issues/366 (epic #354). The real OAuth client is #367 (a user task).

## Purpose

Schedule days and review due dates appear as all-day events in a separate "Study log" Google calendar. They move or disappear when the app changes them. Nothing is read back from Google (user decision, 2026-11-24).

## Design

- **A reconciler, not hooks.** Schedule items and review rounds change in many places (catch-up, moving, completing, a done study log creating round 1, the timer). Instead of hooking each one, every sync compares what the app holds now (open schedule items from today on, every open review round) with the events made before (`calendar_events`) and creates, moves or deletes the difference (`calendar-sync-plan.ts`, a pure function). A missed trigger is repaired by the next sync. `schedules.ts` and `reviews.ts` are **not edited**.
- **Trigger.** One `app.use` in `app.ts` over `/api/schedules`, `/api/reviews`, `/api/study-logs` and `/api/study-timer`: a write that succeeds starts a sync after a short wait (1.5 s). Reading the schedules starts one at most every 10 minutes (it picks up the daily day move). Nothing happens while Google is not connected. Syncs run one at a time. "Sync now" on the settings page runs one on demand.
- **Google client** (`google-calendar.ts`): plain `fetch`, no new package, 15 s timeout. Scope `calendar.app.created` (only calendars this app creates). Errors never include a token or Google's raw answer.
- **Token storage** (`calendar-crypto.ts`): the refresh token is encrypted with AES-256-GCM using `CALENDAR_TOKEN_KEY` (32 random bytes, base64) before it is saved, and never logged. The OAuth `state` is an HMAC-signed value that expires after 10 minutes.
- **Privacy.** Only titles and dates go to Google (schedule title and minutes, review round and textbook or chapter title), never memos or answers.
- Routes (`/api/calendar-sync`): `GET /status`, `POST /connect`, `GET /callback` (redirects to `/settings?calendar=...`), `POST /sync`, `DELETE /` (revokes, forgets; the calendar stays in Google). Documented in `docs/openapi.json`.
- Migration `033_calendar_sync.sql`: `calendar_connection` (one row) and `calendar_events`.
- Frontend: a "Google Calendar" card on the Settings page (`calendar-sync.tsx`).
- Config: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `CALENDAR_TOKEN_KEY` in `.env.example` and `compose.yaml` (the compose lines are outside the lane's usual paths; the coordinator was told).

## User tasks (not done here)

- #367: create the Google Cloud OAuth client (redirect URI `https://<site>/api/calendar-sync/callback`), set the four variables on the server, then connect once on Settings and press "Sync now".
- Not verified against real Google: the endpoints and answers follow Google's documented REST API but were only exercised with a stand-in `fetch`.

## Verification

- Unit tests (`backend/test/calendar-sync.test.ts`): encryption and tampering, state signing and expiry, settings, the plan, the Google client with a stand-in `fetch` (sign-in address, all-day event body, missing events, refused token, no secrets in messages).
- DB integration test (`calendar-sync.integration.test.ts`): sign-in callback, sync, move, complete, repeat sync does nothing, disconnect. **Needs `TEST_DATABASE_URL`; no local test DB was available, so it ran in CI only.**
- Frontend tests (`calendar-sync.test.tsx`) for each state.
- Browser check at 390x844 and 1440x900 on the Settings page with mocked `/api`: no horizontal overflow, buttons 36 px high like the other buttons.
