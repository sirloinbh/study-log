# Stop a translation when its request is abandoned (#337)

## Purpose

The extraction route aborts its Claude call when the browser leaves. The translation route did not, so a closed tab kept the call running for up to the 240 s budget while holding one of the 3 shared paid-call slots (#267).

## Changes

| File                                     | Change                                                                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/translation.ts`             | `TranslationSource.signal`, passed to `callClaude`                                                                                                                              |
| `backend/src/exercises.ts`               | The translation route aborts the call when the response closes before it finished, saves nothing for a gone request, and its `finally` frees the slot and the per-exercise lock |
| `backend/test/translation-abort.test.ts` | A client disconnect aborts the translator's signal, no `INSERT` is made, and the same exercise translates again afterwards                                                      |
| `docs/decisions/extraction-rules.md`     | One line on abandoned requests                                                                                                                                                  |

## Verification

See the PR.
