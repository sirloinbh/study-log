# #336 Wait for the reload request in the textbook registration test

Issue: https://github.com/sirloinbh/study-log/issues/336

## Purpose

"registering a textbook posts it, clears the form and shows its detail" read `api.requests[2]` right after the "Registered" text appeared. The list reload after saving may not have been sent yet on a busy machine, so the test failed now and then with `Cannot read properties of undefined (reading 'method')`.

## Changes

- `frontend/src/textbooks.test.tsx`: the reload assertion is wrapped in `waitFor` and reads `api.requests[2]?.method`. Test-only; no screen change.

## Verification

- `npm test -w frontend -- textbooks.test.tsx` ran 10 times in a row: 20 of 20 passed each time. The full `npm run check` passed.

## Follow-up

- The same pattern is in `frontend/src/study-logs.test.tsx:284` (`expect(api.requests[2].method).toBe('GET')` right after a text). That file is not part of this card's owned paths; reported to the coordinator.
