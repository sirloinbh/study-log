import assert from 'node:assert/strict';
import { test } from 'node:test';

import { listenHost, sharedAuth } from '../src/standard/auth.js';

test('listenHost binds 127.0.0.1 when the sign-in is off', () => {
  assert.equal(listenHost(false, {}), '127.0.0.1');
});

test('listenHost binds 0.0.0.0 when the sign-in is on', () => {
  assert.equal(listenHost(true, {}), '0.0.0.0');
});

test('listenHost lets HOST override both cases', () => {
  assert.equal(listenHost(false, { HOST: '10.0.0.5' }), '10.0.0.5');
  assert.equal(listenHost(true, { HOST: '10.0.0.5' }), '10.0.0.5');
});

test('sharedAuth without a sign-in returns no middleware and logs one warning in local mode', () => {
  const warnings: string[] = [];
  assert.equal(
    sharedAuth({ NODE_ENV: 'development' }, (m) => warnings.push(m)),
    undefined,
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /WITHOUT sign-in/);
});

test('sharedAuth refuses to start outside local mode without a sign-in', () => {
  assert.throws(() => sharedAuth({}, () => {}), /AUTH_INTERNAL_URL is required/);
});
