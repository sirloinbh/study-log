import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';

import {
  checkState,
  decryptToken,
  encryptToken,
  makeState,
  parseKey,
} from '../src/calendar-crypto.js';
import { settingsFromEnv } from '../src/calendar-sync.js';
import { planSync } from '../src/calendar-sync-plan.js';
import { googleCalendarClient, GoogleError } from '../src/google-calendar.js';

const key = randomBytes(32);
const config = { clientId: 'id', clientSecret: 'secret', redirectUri: 'https://x.test/cb' };
const event = { summary: 's', date: '2026-11-30', description: '' };

test('a token is stored encrypted, read back with the key, and refused with another key or a change', () => {
  const stored = encryptToken('1//refresh-token', key);
  assert.ok(!stored.includes('refresh-token'));
  assert.notEqual(stored, encryptToken('1//refresh-token', key), 'a fresh iv each time');
  assert.equal(decryptToken(stored, key), '1//refresh-token');
  assert.throws(() => decryptToken(stored, randomBytes(32)));
  const raw = Buffer.from(stored, 'base64');
  raw[raw.length - 1] ^= 1;
  assert.throws(() => decryptToken(raw.toString('base64'), key));
});

test('the key must be 32 bytes of base64', () => {
  assert.equal(parseKey(undefined), undefined);
  assert.equal(parseKey('short'), undefined);
  assert.deepEqual(parseKey(key.toString('base64')), key);
});

test('the sign-in state is accepted only when signed, fresh and untouched', () => {
  const state = makeState(key, 1_000);
  assert.equal(checkState(state, key, 2_000), true);
  assert.equal(checkState(state, key, 1_000 + 11 * 60 * 1000), false, 'expired');
  assert.equal(checkState(state, randomBytes(32), 2_000), false, 'another key');
  const [expiry, nonce, signature] = state.split('.');
  assert.equal(checkState(`${Number(expiry) + 1}.${nonce}.${signature}`, key, 2_000), false);
  assert.equal(checkState('nonsense', key), false);
});

test('settings need all four values, and the key must be valid', () => {
  const env = {
    GOOGLE_CLIENT_ID: 'id',
    GOOGLE_CLIENT_SECRET: 'secret',
    GOOGLE_REDIRECT_URI: 'https://x.test/cb',
    CALENDAR_TOKEN_KEY: key.toString('base64'),
  };
  assert.deepEqual(settingsFromEnv(env).config, config);
  assert.equal(settingsFromEnv({ ...env, GOOGLE_CLIENT_ID: '' }).config, undefined);
  assert.equal(settingsFromEnv({ ...env, CALENDAR_TOKEN_KEY: 'bad' }).config, undefined);
  assert.equal(settingsFromEnv({}).config, undefined);
});

test('the plan creates new items, moves changed ones and removes the ones that are gone', () => {
  const item = (id: number, date: string, summary = 'S') =>
    ({ source: 'schedule_item', sourceId: id, date, summary }) as const;
  const plan = planSync(
    [
      item(1, '2026-11-25'),
      item(2, '2026-11-27'),
      item(3, '2026-11-28', 'new'),
      item(4, '2026-12-01'),
    ],
    [
      { ...item(1, '2026-11-25'), eventId: 'a' },
      { ...item(2, '2026-11-26'), eventId: 'b' },
      { ...item(3, '2026-11-28'), eventId: 'c' },
      { ...item(9, '2026-11-30'), eventId: 'd' },
      { source: 'review', sourceId: 1, date: '2026-11-25', summary: 'S', eventId: 'e' },
    ],
  );
  assert.deepEqual(
    plan.create.map((i) => i.sourceId),
    [4],
  );
  assert.deepEqual(
    plan.update.map((i) => [i.sourceId, i.eventId]),
    [
      [2, 'b'],
      [3, 'c'],
    ],
  );
  assert.deepEqual(
    plan.remove.map((i) => [i.source, i.sourceId]),
    [
      ['schedule_item', 9],
      ['review', 1],
    ],
  );
  assert.deepEqual(planSync([], []), { create: [], update: [], remove: [] });
  // A review and a schedule item with the same id are different events.
  const same = planSync(
    [{ ...item(1, '2026-11-25'), source: 'review' }],
    [{ ...item(1, '2026-11-25'), eventId: 'a' }],
  );
  assert.equal(same.create.length, 1);
  assert.equal(same.remove.length, 1);
  // An exercise review is its own kind too, so exercise 1 is not review 1 or item 1.
  const exercise = planSync(
    [{ ...item(1, '2026-11-25'), source: 'exercise_review' }],
    [{ ...item(1, '2026-11-25'), source: 'exercise_review', eventId: 'x' }],
  );
  assert.deepEqual(exercise, { create: [], update: [], remove: [] });
});

type Call = { url: string; method: string; body: string | null; auth: string | null };
function stub(answer: (call: Call) => Response) {
  const calls: Call[] = [];
  const client = googleCalendarClient((async (url: string, init: RequestInit) => {
    const call = {
      url,
      method: init.method ?? 'GET',
      body: init.body ? String(init.body) : null,
      auth: new Headers(init.headers).get('authorization'),
    };
    calls.push(call);
    return answer(call);
  }) as unknown as typeof fetch);
  return { client, calls };
}
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

test('the sign-in address asks for offline access to calendars this app creates only', () => {
  const url = new URL(stub(() => ok({})).client.authUrl(config, 'st'));
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(
    url.searchParams.get('scope'),
    'https://www.googleapis.com/auth/calendar.app.created',
  );
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('state'), 'st');
  assert.equal(url.searchParams.get('redirect_uri'), config.redirectUri);
});

test('the client exchanges a code, refreshes access and makes a calendar with all-day events', async () => {
  const { client, calls } = stub((call) => {
    if (call.url.endsWith('/token'))
      return ok(
        call.body?.includes('authorization_code') ? { refresh_token: 'R' } : { access_token: 'A' },
      );
    if (call.url.endsWith('/calendars')) return ok({ id: 'cal@group' });
    return ok({ id: 'ev1' });
  });
  assert.equal(await client.exchangeCode(config, 'code'), 'R');
  assert.equal(await client.accessToken(config, 'R'), 'A');
  assert.equal(await client.createCalendar('A', 'Study log'), 'cal@group');
  assert.equal(
    await client.insertEvent('A', 'cal@group', {
      ...event,
      summary: 'Read (1 h)',
      date: '2026-11-30',
    }),
    'ev1',
  );
  const sent = calls.at(-1)!;
  assert.equal(sent.url, 'https://www.googleapis.com/calendar/v3/calendars/cal%40group/events');
  assert.equal(sent.auth, 'Bearer A');
  const body = JSON.parse(sent.body!) as { start: object; end: object };
  assert.deepEqual(body.start, { date: '2026-11-30' });
  assert.deepEqual(body.end, { date: '2026-12-01' }, 'the end of an all-day event is the next day');
  assert.equal((JSON.parse(calls[2].body!) as { timeZone: string }).timeZone, 'Asia/Seoul');
});

test('updating or deleting an event that is gone in Google is not a failure', async () => {
  const { client } = stub(() => ok({ error: {} }, 404));
  assert.equal(await client.updateEvent('A', 'c', 'e', event), false);
  await client.deleteEvent('A', 'c', 'e');
  await assert.rejects(client.insertEvent('A', 'c', event), { kind: 'missing' });
});

test('a refused refresh token asks to connect again, without showing any token', async () => {
  const { client } = stub(() => ok({ error: 'invalid_grant' }, 400));
  await assert.rejects(client.accessToken(config, 'SECRET-REFRESH'), (error: GoogleError) => {
    assert.equal(error.kind, 'auth');
    assert.ok(!error.message.includes('SECRET-REFRESH'));
    return true;
  });
});

test('an unreachable Google and a server error are told plainly', async () => {
  const down = googleCalendarClient((async () => {
    throw new Error('ECONNRESET secret-detail');
  }) as unknown as typeof fetch);
  await assert.rejects(down.accessToken(config, 'R'), (error: Error) => {
    assert.match(error.message, /Could not reach Google/);
    assert.ok(!error.message.includes('secret-detail'));
    return true;
  });
  await assert.rejects(stub(() => ok({}, 500)).client.deleteEvent('A', 'c', 'e'), /status 500/);
});
