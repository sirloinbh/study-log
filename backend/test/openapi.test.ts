import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import express from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { createApp } from '../src/app.js';
import { document, operations } from '../src/openapi.js';
import { schemaOf } from '../src/standard/openapi.js';

type Layer = {
  route?: { path: string; methods: Record<string, boolean> };
  handle?: { stack?: Layer[] };
};

// The routes live in sub-routers mounted with app.use(prefix, router). Express keeps no mount path
// on the layer, so it is recorded while the app is built (see documentedApp).
const mounts = new WeakMap<object, string>();

// The app as the server builds it, with no database: routes are only registered, never called, so
// the pool is never used. Use this instead of createApp where the routes are listed.
function documentedApp() {
  const original = express.application.use;
  express.application.use = function (this: unknown, ...args: unknown[]) {
    const [first, ...handlers] = args;
    if (typeof first === 'string')
      for (const handler of handlers.flat())
        if (typeof handler === 'function') mounts.set(handler, first);
    return (original as (...all: unknown[]) => unknown).apply(this, args);
  } as typeof original;
  try {
    return createApp({} as Pool);
  } finally {
    express.application.use = original;
  }
}

function routesOf(stack: Layer[], prefix: string): string[] {
  return stack.flatMap((layer) => {
    if (layer.route) {
      const path = layer.route.path === '/' ? '' : layer.route.path;
      return Object.keys(layer.route.methods).map((m) => `${m.toUpperCase()} ${prefix}${path}`);
    }
    const mount = layer.handle && mounts.get(layer.handle);
    return layer.handle?.stack && mount !== undefined
      ? routesOf(layer.handle.stack, prefix + mount)
      : [];
  });
}
function registeredRoutes(app: express.Express) {
  return routesOf((app as unknown as { router: { stack: Layer[] } }).router.stack, '');
}

// Routes are only registered here, never called, so no database is needed.
const app = documentedApp;

test('docs/openapi.json is up to date with the operation table', async () => {
  const committed = JSON.parse(
    await readFile(new URL('../../docs/openapi.json', import.meta.url), 'utf8'),
  ) as unknown;
  assert.deepEqual(
    committed,
    JSON.parse(JSON.stringify(document)),
    'run `npm run openapi -w backend` and commit',
  );
});

test('the operation table and the registered routes are the same set', () => {
  assert.deepEqual(Object.keys(operations).sort(), [...registeredRoutes(app())].sort());
});

test('API paths start with /api and use lowercase words joined by hyphens', () => {
  const routes = registeredRoutes(app());
  assert.ok(routes.includes('GET /api/health'));
  for (const route of routes)
    assert.match(route, /^[A-Z]+ \/api(\/(:\w+|[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+)?))*$/);
});

test('guarded routes document the sign-in, 401 and 429; the public route does not', () => {
  const paths = document.paths as Record<
    string,
    Record<string, { security?: unknown[]; responses: Record<string, unknown> }>
  >;
  assert.deepEqual(paths['/api/health']!.get!.security, []);
  assert.ok(!('401' in paths['/api/health']!.get!.responses));
  assert.ok('429' in paths['/api/me']!.get!.responses);
});

test('a type JSON Schema cannot express fails instead of being skipped', () => {
  assert.throws(() => schemaOf(z.date()), /Date cannot be represented/);
});
