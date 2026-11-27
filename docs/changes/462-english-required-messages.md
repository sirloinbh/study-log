# Show required-field messages in English (#462)

## Purpose

Write-flow audit 2026-11-27: the popup for an empty `required` field is in the browser's language ("이 입력란을 작성하세요." in a Korean browser) in an English-only app.

## Changes

| File                                        | Change                                                                                                                                                                                                            |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/validation-messages.ts`       | New: one capture listener for `invalid` sets an English message from the field's validity; it is cleared on input/change and before each submit attempt, so a value filled in by code never leaves a stale error. |
| `frontend/src/app.tsx`                      | One side-effect import that installs it (`main.tsx` is a managed file).                                                                                                                                           |
| `frontend/src/validation-messages.test.tsx` | Empty field and choice messages; clearing on input and for values set by code.                                                                                                                                    |

## Verification

See the PR.
