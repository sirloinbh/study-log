# Give the Week view a unique landmark name (#433)

## Purpose

The 2026-11-26 UX audit of the #420 screens: axe `landmark-unique` on `/week` (the card was labelled "Week", like the page section), and the week buttons sat right on top of the date heading.

## Changes

| File                              | Change                                                                              |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| `frontend/src/week-view.tsx`      | Card label "Days of the week"; margin under the buttons.                            |
| `frontend/src/week-view.test.tsx` | The card is a region named "Days of the week" and no second region is named "Week". |

## Verification

- Before: axe on `/week` at 390x844 and 1440x900 reported `landmark-unique` x1. After: see the PR.
