// One JSON log line per Claude call (#245, ADR-0019 in sirloinbh/project-standards): which feature
// called which model, and what it cost in tokens. The shape follows the request log in
// standard/http.ts. Prompt and answer text are never logged, and a failure logs only its type and
// status, not its message (an API error message can echo part of the request).
export type ClaudeFeature = 'translation' | 'extraction' | 'retrospective' | 'feedback';

const count = (value: unknown) => (typeof value === 'number' ? value : null);

type Usage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

type Call = { feature: ClaudeFeature; model: string; requestId?: string; started: number };

export function startClaudeCall(feature: ClaudeFeature, model: string, requestId?: string): Call {
  return { feature, model, requestId, started: performance.now() };
}

// A reply that stopped for one of these reasons was paid for but cannot be used (#268), so its line
// is an error, not info.
const failedStops = new Set(['max_tokens', 'refusal']);

// Logs a call that returned. Whatever `usage` or `stop_reason` is missing is null.

export function logClaudeSuccess(
  call: Call,
  response: { model?: string; stop_reason?: string | null; usage?: Usage | null },
) {
  const usage = response.usage ?? {};
  const failed = failedStops.has(response.stop_reason ?? '');
  (failed ? console.error : console.log)(
    JSON.stringify({
      time: new Date().toISOString(),
      level: failed ? 'error' : 'info',
      event: 'claude_call',
      requestId: call.requestId,
      feature: call.feature,
      model: response.model ?? call.model,
      input_tokens: count(usage.input_tokens),
      output_tokens: count(usage.output_tokens),
      cache_read_input_tokens: count(usage.cache_read_input_tokens),
      cache_creation_input_tokens: count(usage.cache_creation_input_tokens),
      stop_reason: response.stop_reason ?? null,
      ms: Math.round(performance.now() - call.started),
    }),
  );
}

// Logs a call that threw: the error's class name and HTTP status, never its message.
export function logClaudeFailure(call: Call, error: unknown) {
  const status = (error as { status?: unknown } | null)?.status;
  console.error(
    JSON.stringify({
      time: new Date().toISOString(),
      level: 'error',
      event: 'claude_call_failed',
      requestId: call.requestId,
      feature: call.feature,
      model: call.model,
      error_type: error instanceof Error ? error.constructor.name : typeof error,
      status: typeof status === 'number' ? status : null,
      ms: Math.round(performance.now() - call.started),
    }),
  );
}
