import Anthropic from '@anthropic-ai/sdk';
import { WorkloadIdentityError } from '@anthropic-ai/sdk/lib/credentials/types';

import {
  type ClaudeFeature,
  logClaudeFailure,
  logClaudeSuccess,
  startClaudeCall,
} from './claude-usage.js';

// The one place a Claude call is made for translation and extraction (#268): the time it may take,
// the usage log line, the stop reasons that mean failure, and the mapping of API failures to a
// status and a message the person can act on.

// How long one request may take in all, retries included. The API answers only when the whole call
// is done, so this has to stay under the time the proxy in front waits for a reply; past it the
// person would see a gateway error while the paid call kept running. The retries and the timeout of
// one attempt below add up to less than this.
export const claudeBudgetMs = 240_000;
// One retry on a failed attempt (the SDK default is two). Each attempt may use up to `attemptMs`.
export const claudeMaxRetries = 1;
export const claudeAttemptMs = 110_000;

export type ClaudeRequestOptions = { signal: AbortSignal; timeout: number; maxRetries: number };

export type ClaudeCall = {
  feature: ClaudeFeature;
  model: string;
  requestId?: string;
  // Aborts the call when the request that asked for it is gone.
  signal?: AbortSignal;
  // Makes the feature's own error class (TranslationError, ExtractionError).
  fail: (status: number, message: string) => Error;
  // What the person is told when the model declines, or when the reply is cut off at `max_tokens`.
  refusal: string;
  tooLong: string;
  // Sends the request with these options and returns the finished message.
  run: (options: ClaudeRequestOptions) => Promise<Anthropic.Beta.BetaMessage>;
};

// Turns API failures into what the person can act on: a status and a message naming the service
// (`what`: "translation" or "extraction", #30). Most specific first. Credentials missing altogether
// fail before any request with a plain Error (not an SDK error class), so that one is told apart by
// its message. Anything else is not an API failure and is returned as undefined.
export function apiFailure(error: unknown, what: string) {
  const What = what[0].toUpperCase() + what.slice(1);
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  )
    return {
      status: 503,
      message: `${What} API authentication failed. Check ANTHROPIC_API_KEY on the server`,
    };
  if (error instanceof Anthropic.RateLimitError)
    return { status: 429, message: `Too many ${what} requests. Try again in a moment` };
  if (error instanceof Anthropic.APIConnectionTimeoutError)
    return { status: 504, message: `The ${what} service took too long. Try again` };
  if (error instanceof Anthropic.APIConnectionError)
    return { status: 502, message: `Could not connect to the ${what} service` };
  if (error instanceof Anthropic.APIError)
    return { status: 502, message: `${What} service error (${error.status ?? 'no response'})` };
  // Without a key the SDK throws a plain error, or WorkloadIdentityError when it falls back to an
  // Anthropic CLI sign-in profile whose credentials file is missing (#224).
  if (
    error instanceof WorkloadIdentityError ||
    (error instanceof Error && error.message.startsWith('Could not resolve authentication method'))
  )
    return {
      status: 503,
      message: `The ${what} API key (ANTHROPIC_API_KEY) is not set on the server`,
    };
  if (error instanceof Anthropic.AnthropicError)
    return { status: 502, message: `${What} service error` };
  return undefined;
}

// Runs the call and returns a message that finished normally. A refusal or a reply cut off at
// `max_tokens` is paid for but unusable, so it is logged as a failure and refused.
export async function callClaude(call: ClaudeCall) {
  const started = startClaudeCall(call.feature, call.model, call.requestId);
  // The total budget holds even when the SDK's own timeout does not apply (a streamed reply is read
  // after the headers arrive), and the caller's signal still stops the call early.
  const budget = AbortSignal.timeout(claudeBudgetMs);
  const signal = call.signal ? AbortSignal.any([call.signal, budget]) : budget;
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await call.run({ signal, timeout: claudeAttemptMs, maxRetries: claudeMaxRetries });
  } catch (error) {
    logClaudeFailure(started, error);
    // The budget ran out; the caller leaving is not reported as a timeout.
    if (budget.aborted && !call.signal?.aborted)
      throw call.fail(504, `The ${call.feature} service took too long. Try again`);
    const failure = apiFailure(error, call.feature);
    if (failure) throw call.fail(failure.status, failure.message);
    throw error;
  }
  logClaudeSuccess(started, response);
  if (response.stop_reason === 'refusal') throw call.fail(422, call.refusal);
  if (response.stop_reason === 'max_tokens') throw call.fail(502, call.tooLong);
  return response;
}
