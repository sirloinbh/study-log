// zod 4 has one `error` option where zod 3 had `required_error` and `invalid_type_error`.
export const missingOrInvalid = (missing: string, invalid: string) => ({
  error: (issue: { input?: unknown }) => (issue.input === undefined ? missing : invalid),
});
