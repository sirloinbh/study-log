import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fetchBlockedPorts, openFetchablePort } from './helpers.js';

// A fake listener that hands out the given ports in order and records which were closed.
function ports(...sequence: number[]) {
  const closed: number[] = [];
  let next = 0;
  const open = async () => {
    const port = sequence[next++];
    return { port, close: async () => void closed.push(port) };
  };
  return { open, closed, opened: () => next };
}

test('a port fetch refuses is closed and another one is opened (#56)', async () => {
  const fake = ports(6666, 10080, 43210);
  const { port } = await openFetchablePort(fake.open);
  assert.equal(port, 43210);
  assert.deepEqual(fake.closed, [6666, 10080]);
});

test('an allowed first port is used as it is', async () => {
  const fake = ports(43210);
  assert.equal((await openFetchablePort(fake.open)).port, 43210);
  assert.equal(fake.opened(), 1);
  assert.deepEqual(fake.closed, []);
});

test('it gives up after the given number of refused ports', async () => {
  const fake = ports(6000, 6665, 6667);
  await assert.rejects(openFetchablePort(fake.open, 3), /No port fetch may call after 3 tries/);
  assert.deepEqual(fake.closed, [6000, 6665, 6667]);
});

test('every listed port is one Node fetch refuses as a bad port', async () => {
  for (const port of [6000, 6665, 6669, 10080]) assert.ok(fetchBlockedPorts.has(port), `${port}`);
  // Refused before connecting, so this is quick and does not depend on what listens there.
  for (const port of fetchBlockedPorts) {
    await assert.rejects(fetch(`http://127.0.0.1:${port}/`), (error: Error) => {
      assert.equal((error.cause as Error | undefined)?.message, 'bad port', `${port}`);
      return true;
    });
  }
});
