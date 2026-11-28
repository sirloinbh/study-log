# #512 Adopt the shared design-system helpers

Part of sirloinbh/project-standards#1177.

## Change

| Local copy (removed or reduced)   | Shared piece now used                                                       |
| --------------------------------- | --------------------------------------------------------------------------- |
| `plural.ts`                       | `plural` from `lib/format` (counts are grouped: "1,200 sets")               |
| `serviceDate` in `date.ts`        | `serviceToday` from `lib/format` (the midnight hook `useServiceDate` stays) |
| `shiftDays` in `retrospective.ts` | `addDays` from `components/period-nav/periods`                              |

## Not changed

- `Loading`, `ButtonSpinner`, `DeleteConfirm` and `FileField` have app-specific shapes and tests; tables and empty states are left for a separate card.

## Visible differences

- Counts of 1,000 or more get a thousands separator.

## Verification

See the PR.
