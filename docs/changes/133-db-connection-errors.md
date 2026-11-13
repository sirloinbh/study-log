# #133 Keep the API process from dying when the DB connection drops

- Issue: [#133](https://github.com/sirloinbh/study-log/issues/133)
- Branch: `fix/133-db-connection-errors`

## Reproduction

Before the fix, I cut the connection with `pg_terminate_backend` on the test DB. For both an idle connection and a connection in a transaction, the process ended with exit code 1 because of `Unhandled 'error' event`.

## Cause

`pg` reports a dropped connection with an `error` event, and if nobody receives it, Node ends the process. There was no handler in `backend/src`.

## Changes

- `backend/src/sql.ts`: added `createPool`. It attaches a handler to every connection the pool creates and to the pool itself.
- `backend/src/server.ts`: uses `createPool`.

## Behavior

- If the connection drops while idle or between the queries of a transaction, only `db_connection_error` and the error message are logged. If it drops while a query is running, it is delivered as that query's error and logged as `request_error`.
- A request in progress on that connection still ends with a Korean 500 as before, and the transaction is not applied. As an exception, if the connection drops after the DB processed the `COMMIT` and before the response was sent, the data may be saved even though the answer is 500.
- The pool discards the dropped connection, and the next request is handled with a new connection.

## Out of scope

- A case where the network drops and no shutdown signal at all comes from the DB side is not covered. A request in progress can hang with no response. A time limit (such as `query_timeout`) would be needed, but the API and DB are on the same compose network, so it is rare, and the limit for long queries would also have to be decided.
- The problem that if the termination signal (SIGTERM) comes twice, `pool.end()` is called twice and the exit code becomes 1 existed before this change and is unrelated to dropped connections, so I did not fix it.

## Tests

`backend/test/db-connection.integration.test.ts`: it cuts real connections to check.

- Idle connection: 1 log entry (the fields are only `event` and `message`, with no connection string), and the next query is normal.
- Between the queries of a transaction: rejected, and the next query is normal.
- During request handling: a Korean 500, nothing saved, and the next request is normal.

## Review

The first review found no defects in the core fix. The following were fixed in this PR.

- A fixed 200ms wait could fail under load, so it waits until the pool discards the connection.
- When a test failed, the server log was hidden, so I put the log in the failure message of the earlier step.
- Strengthened the log check to 2 fields and no connection string.
- Wrote down the `COMMIT` exception and the out-of-scope items in the document.

In the second review, it was pointed out that the log description was broader than what really happens, and I fixed it. The review is limited to 2 rounds, so I did not do a third review.

## Verification

`npm run check` with `TEST_DATABASE_URL` set passed. Backend 314, frontend 100, and skills 4 passed. The skips were 2 frontend tests, the dark-only app tests that came from the central standards. There was no screen change, so I did not check in a browser.

I did not restart the DB service itself under a running server. I confirmed the same event by cutting individual connections.
