// `npm run openapi -w backend`: regenerates docs/openapi.json from the routes and schemas.
import { writeFile } from 'node:fs/promises';

import { buildOpenApi, documentedApp } from './openapi.js';

// Routes are only registered, never called, so no database connection is opened.
const spec = buildOpenApi(documentedApp());
const out = new URL('../../docs/openapi.json', import.meta.url);
await writeFile(out, JSON.stringify(spec, null, 2) + '\n');
console.log(`docs/openapi.json: ${Object.keys(spec.paths).length} paths`);
