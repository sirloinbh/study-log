// OpenAPI 3.1 document built from the registered Express routes and the server's own Zod schemas.
// `npm run openapi -w backend` writes docs/openapi.json; a test fails when it is out of date.
import express from 'express';
import type { Pool } from 'pg';
import type { z } from 'zod/v4';

import { createApp } from './app.js';
import { calendarQuery } from './calendar.js';
import {
  answerInput,
  answersInput,
  exerciseBulkInput,
  exerciseInput,
  importantInput,
  textbookListQuery,
} from './exercises.js';
import { keywordInput, keywordListQuery } from './keywords.js';
import {
  bodyInput as retrospectiveInput,
  listQuery as retrospectiveListQuery,
  periodQuery,
  retrospectiveKinds,
} from './retrospectives.js';
import { dueDateInput } from './reviews.js';
import { moveInput, scheduleCreateInput, scheduleUpdateInput } from './schedules.js';
import { patternQuery, statsPeriodQuery, studyTimeQuery, textbookQuery } from './stats.js';
import { studyLogInput, studyLogListQuery } from './study-logs.js';
import {
  contentBulkInput,
  contentCreateInput,
  contentOrderInput,
  contentUpdateInput,
} from './textbook-contents.js';
import { textbookInput } from './textbooks.js';

type Json = Record<string, unknown>;

type CheckDef = {
  check: string;
  format?: string;
  pattern?: RegExp;
  minimum?: number;
  maximum?: number;
  length?: number;
  value?: number;
  inclusive?: boolean;
};
const checksOf = (def: Json) =>
  ((def.checks ?? []) as { _zod: { def: CheckDef } }[]).map((check) => check._zod.def);

const STRING_FORMATS: Record<string, string> = {
  uuid: 'uuid',
  guid: 'uuid',
  email: 'email',
  url: 'uri',
  datetime: 'date-time',
  date: 'date',
  time: 'time',
};
function stringFormat(format: string) {
  const name = STRING_FORMATS[format];
  if (!name) throw new Error(`Unsupported string format: ${format}`);
  return name;
}
// z.number().int() is a check and z.int() is the type itself; float32 and float64 are the same kinds but not integers.
const isIntegerFormat = (format: unknown) => typeof format === 'string' && format.includes('int');

// Converts the Zod 4 types the API uses. Refinements (cross-field rules) cannot be expressed
// here; any other unsupported type fails loudly instead of being silently dropped.
export function jsonSchema(schema: z.ZodType): Json {
  const def = schema._zod.def as unknown as Json & { type: string };
  switch (def.type) {
    case 'object': {
      const shape = def.shape as Record<string, z.ZodType>;
      const required = Object.keys(shape).filter((key) => !shape[key].isOptional());
      const catchall = def.catchall as z.ZodType | undefined;
      return {
        type: 'object',
        properties: Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, jsonSchema(v)])),
        ...(required.length ? { required } : {}),
        ...(catchall?._zod.def.type === 'never' ? { additionalProperties: false } : {}),
      };
    }
    case 'string': {
      const out: Json = { type: 'string' };
      // z.uuid() and z.email() carry their format on the type, z.string().uuid() as a check.
      if (def.format) out.format = stringFormat(def.format as string);
      for (const check of checksOf(def)) {
        if (check.check === 'min_length') out.minLength = check.minimum;
        else if (check.check === 'max_length') out.maxLength = check.maximum;
        else if (check.check === 'length_equals') out.minLength = out.maxLength = check.length;
        else if (check.check === 'string_format' && check.format === 'regex')
          out.pattern = check.pattern!.source;
        else if (check.check === 'string_format') out.format = stringFormat(check.format!);
        // `overwrite` is trim(); `custom` is a refinement.
        else if (check.check !== 'overwrite' && check.check !== 'custom')
          throw new Error(`Unsupported string check: ${check.format ?? check.check}`);
      }
      return out;
    }
    case 'number': {
      const out: Json = { type: isIntegerFormat(def.format) ? 'integer' : 'number' };
      for (const check of checksOf(def)) {
        if (check.check === 'number_format') {
          if (isIntegerFormat(check.format)) out.type = 'integer';
        } else if (check.check === 'greater_than')
          out[check.inclusive ? 'minimum' : 'exclusiveMinimum'] = check.value;
        else if (check.check === 'less_than')
          out[check.inclusive ? 'maximum' : 'exclusiveMaximum'] = check.value;
        else if (check.check === 'multiple_of') out.multipleOf = check.value;
        else if (check.check !== 'custom')
          throw new Error(`Unsupported number check: ${check.check}`);
      }
      return out;
    }
    case 'boolean':
      return { type: 'boolean' };
    case 'array': {
      let min: number | undefined;
      let max: number | undefined;
      for (const check of checksOf(def)) {
        if (check.check === 'min_length') min = check.minimum;
        else if (check.check === 'max_length') max = check.maximum;
        else if (check.check === 'length_equals') min = max = check.length;
        else if (check.check !== 'custom')
          throw new Error(`Unsupported array check: ${check.check}`);
      }
      return {
        type: 'array',
        items: jsonSchema(def.element as z.ZodType),
        ...(min !== undefined ? { minItems: min } : {}),
        ...(max !== undefined ? { maxItems: max } : {}),
      };
    }
    case 'enum':
      return { type: 'string', enum: Object.values(def.entries as Record<string, string>) };
    case 'nullable': {
      const inner = jsonSchema(def.innerType as z.ZodType);
      return typeof inner.type === 'string'
        ? { ...inner, type: [inner.type, 'null'] }
        : { anyOf: [inner, { type: 'null' }] };
    }
    case 'optional':
      return jsonSchema(def.innerType as z.ZodType);
    case 'default':
      return { ...jsonSchema(def.innerType as z.ZodType), default: def.defaultValue };
    // .transform() is a pipe; the request is described by what comes in. z.preprocess() is a pipe
    // starting from a transform, which says nothing about the value, so its target describes it.
    case 'pipe': {
      const input = def.in as z.ZodType;
      return jsonSchema(input._zod.def.type === 'transform' ? (def.out as z.ZodType) : input);
    }
    case 'unknown':
      return {};
    default:
      throw new Error(`Unsupported Zod type for OpenAPI: ${def.type}`);
  }
}

type Operation = {
  summary: string;
  body?: [name: string, schema: z.ZodType];
  query?: z.ZodType;
  // Success status first; the rest are documented error statuses.
  status: number[];
};
// Every registered route must appear here exactly once (checked when building).
// Every route that reads an id, a body or a query also answers 400 when validation fails.
const operations: Record<string, Operation> = {
  'GET /api/health': { summary: 'Check the server and database connection', status: [200, 500] },
  'GET /api/me': { summary: 'Get the signed-in user', status: [200, 401, 503] },

  'GET /api/study-logs/calendar': {
    summary: 'Get minutes studied and log count for each day of a month',
    query: calendarQuery,
    status: [200, 400],
  },
  'GET /api/study-logs': {
    summary: 'List study logs for one day, or search the latest ones',
    query: studyLogListQuery,
    status: [200, 400],
  },
  'GET /api/study-logs/:id': { summary: 'Get one study log', status: [200, 400, 404] },
  'POST /api/study-logs': {
    summary:
      'Add a study log; the end time must differ from the start time and a contents entry needs a textbook',
    body: ['StudyLog', studyLogInput],
    status: [201, 400],
  },
  'PUT /api/study-logs/:id': {
    summary: 'Replace a study log; the same cross-field rules as adding apply',
    body: ['StudyLog', studyLogInput],
    status: [200, 400, 404],
  },
  'DELETE /api/study-logs/:id': { summary: 'Delete a study log', status: [204, 400, 404] },

  'GET /api/reviews/today': {
    summary: 'List open review rounds due today or earlier',
    status: [200],
  },
  'GET /api/reviews/week': {
    summary: 'List open review rounds due by the end of this week',
    status: [200],
  },
  'GET /api/reviews/all': { summary: 'List all open review rounds', status: [200] },
  'GET /api/reviews/today/count': {
    summary: 'Count the review rounds due today, for the menu badge',
    status: [200],
  },
  'POST /api/reviews/:id/complete': {
    summary: 'Complete a review round and create the next one',
    status: [200, 400, 404, 409],
  },
  'POST /api/reviews/:id/snooze': {
    summary: 'Move an open review round to a later day',
    status: [200, 400, 404, 409],
  },
  'PUT /api/reviews/:id/due-date': {
    summary: 'Set the due date of an open review round',
    body: ['ReviewDueDate', dueDateInput],
    status: [200, 400, 404, 409],
  },

  'GET /api/keywords': {
    summary: 'List keywords for one day, or search the latest ones',
    query: keywordListQuery,
    status: [200, 400],
  },
  'GET /api/keywords/:id': { summary: 'Get one keyword', status: [200, 400, 404] },
  'POST /api/keywords': {
    summary: 'Add a keyword; a left-out date means today',
    body: ['Keyword', keywordInput],
    status: [201, 400, 409],
  },
  'PUT /api/keywords/:id': {
    summary: 'Replace a keyword; a left-out date means today',
    body: ['Keyword', keywordInput],
    status: [200, 400, 404, 409],
  },
  'DELETE /api/keywords/:id': { summary: 'Delete a keyword', status: [204, 400, 404] },

  'GET /api/stats/study-time': {
    summary: 'Get study time series and totals for a period, by study type or textbook',
    query: studyTimeQuery,
    status: [200, 400, 404],
  },
  'GET /api/stats/heatmap': {
    summary: 'Get the study heatmap for the last 53 weeks',
    status: [200],
  },
  'GET /api/stats/reviews': {
    summary: 'Get review completion statistics for a period',
    query: statsPeriodQuery,
    status: [200, 400],
  },
  'GET /api/stats/textbooks': {
    summary: 'Get chapters done and schedule completion per textbook',
    query: textbookQuery,
    status: [200, 400, 404],
  },
  'GET /api/stats/patterns': {
    summary: 'Get the study pattern by weekday and hour; the period is at most 10 years',
    query: patternQuery,
    status: [200, 400],
  },

  'GET /api/retrospectives/period': {
    summary: 'Get the week or month holding a date, its retrospective and a study summary',
    query: periodQuery,
    status: [200, 400],
  },
  'GET /api/retrospectives': {
    summary: 'List the latest retrospectives, newest period first',
    query: retrospectiveListQuery,
    status: [200, 400],
  },
  'PUT /api/retrospectives/:kind/:start': {
    summary:
      'Write the retrospective of a week (starting Sunday) or month (starting the 1st), replacing the existing one',
    body: ['Retrospective', retrospectiveInput],
    status: [200, 400],
  },
  'DELETE /api/retrospectives/:kind/:start': {
    summary: 'Delete the retrospective of a week or month',
    status: [204, 400, 404],
  },

  'GET /api/schedules': { summary: 'List study schedules with their progress', status: [200] },
  'GET /api/schedules/:id': { summary: 'Get one schedule with its items', status: [200, 400, 404] },
  'POST /api/schedules': {
    summary:
      'Create a schedule from a period and daily amounts, spreading chapters over the days; reads holidays',
    body: ['ScheduleCreate', scheduleCreateInput],
    status: [201, 400, 503],
  },
  'PUT /api/schedules/:id': {
    summary: 'Rename a schedule',
    body: ['ScheduleUpdate', scheduleUpdateInput],
    status: [200, 400, 404],
  },
  'DELETE /api/schedules/:id': { summary: 'Delete a schedule', status: [204, 400, 404] },
  'POST /api/schedules/:id/items/:itemId/complete': {
    summary: 'Mark a schedule item completed',
    status: [200, 400, 404, 409],
  },
  'POST /api/schedules/:id/items/:itemId/reopen': {
    summary: 'Mark a completed schedule item open again',
    status: [200, 400, 404, 409],
  },
  'PUT /api/schedules/:id/items/:itemId/date': {
    summary: 'Move a schedule item to a date, optionally with the later open items',
    body: ['ScheduleItemMove', moveInput],
    status: [200, 400, 404, 409],
  },

  'GET /api/textbooks': { summary: 'List textbooks', status: [200] },
  'GET /api/textbooks/:id': { summary: 'Get one textbook', status: [200, 400, 404] },
  'POST /api/textbooks': {
    summary: 'Add a textbook',
    body: ['Textbook', textbookInput],
    status: [201, 400],
  },
  'PUT /api/textbooks/:id': {
    summary: 'Replace a textbook',
    body: ['Textbook', textbookInput],
    status: [200, 400, 404],
  },
  'DELETE /api/textbooks/:id': {
    summary:
      'Delete a textbook with its contents, exercises and stored files; refused while a study log or schedule uses it',
    status: [204, 400, 404, 409, 502, 503],
  },

  'GET /api/textbooks/:textbookId/contents': {
    summary: 'Get the contents tree of a textbook',
    status: [200, 400, 404],
  },
  'POST /api/textbooks/:textbookId/contents': {
    summary: 'Add a contents entry, last among its siblings',
    body: ['ContentCreate', contentCreateInput],
    status: [201, 400, 404],
  },
  'POST /api/textbooks/:textbookId/contents/bulk': {
    summary: 'Add pasted contents entries in reading order; returns the whole tree',
    body: ['ContentBulk', contentBulkInput],
    status: [201, 400, 404, 413],
  },
  'PUT /api/textbooks/:textbookId/contents/order': {
    summary: 'Reorder the children of one contents entry; returns the whole tree',
    body: ['ContentOrder', contentOrderInput],
    status: [200, 400, 404],
  },
  'PUT /api/textbooks/:textbookId/contents/:id': {
    summary: 'Rename a contents entry',
    body: ['ContentUpdate', contentUpdateInput],
    status: [200, 400, 404],
  },
  'DELETE /api/textbooks/:textbookId/contents/:id': {
    summary:
      'Delete a contents entry with its children, exercises and stored files; refused while a study log or schedule uses it',
    status: [204, 400, 404, 409, 502, 503],
  },

  'GET /api/textbooks/:textbookId/contents/:contentId/exercises': {
    summary: 'List the exercises of one chapter',
    status: [200, 400, 404],
  },
  'POST /api/textbooks/:textbookId/contents/:contentId/exercises': {
    summary: 'Add an exercise to a chapter',
    body: ['Exercise', exerciseInput],
    status: [201, 400, 404],
  },
  'POST /api/textbooks/:textbookId/contents/:contentId/exercises/extract': {
    summary:
      'Read problems or answers from an uploaded PDF or image with Claude, without saving; multipart/form-data with fields file and kind, header X-Requested-With: study-log',
    status: [200, 400, 403, 404, 409, 413, 415, 422, 429, 502, 503],
  },
  'POST /api/textbooks/:textbookId/contents/:contentId/exercises/bulk': {
    summary: 'Save reviewed problems with their answers into a chapter, all or nothing',
    body: ['ExerciseBulk', exerciseBulkInput],
    status: [201, 400, 404, 413],
  },
  'PUT /api/textbooks/:textbookId/contents/:contentId/exercises/answers': {
    summary: 'Save answers matched to exercises of a chapter, all or nothing',
    body: ['ExerciseAnswers', answersInput],
    status: [200, 400, 404, 413],
  },
  'GET /api/textbooks/:textbookId/exercises': {
    summary: 'List the exercises of a textbook, optionally of one chapter or only important ones',
    query: textbookListQuery,
    status: [200, 400, 404],
  },

  'GET /api/exercises/:id/files': {
    summary: 'List the files stored for an exercise',
    status: [200, 400, 404],
  },
  'POST /api/exercises/:id/files': {
    summary:
      'Upload one PDF, JPEG or PNG file for an exercise (at most 20 MB); multipart/form-data with fields file and role, header X-Requested-With: study-log',
    status: [201, 400, 403, 404, 413, 415, 502, 503],
  },
  'GET /api/exercise-files/:fileId': {
    summary: 'Get the details of a stored file',
    status: [200, 400, 404],
  },
  'GET /api/exercise-files/:fileId/content': {
    summary: 'Download the stored file itself',
    status: [200, 400, 404, 502, 503],
  },
  'DELETE /api/exercise-files/:fileId': {
    summary: 'Delete a stored file',
    status: [204, 400, 404, 502, 503],
  },

  'GET /api/exercises/:id': { summary: 'Get one exercise', status: [200, 400, 404] },
  'PUT /api/exercises/:id': {
    summary: 'Replace an exercise',
    body: ['Exercise', exerciseInput],
    status: [200, 400, 404],
  },
  'PATCH /api/exercises/:id/important': {
    summary: 'Set or clear the important mark of an exercise',
    body: ['ExerciseImportant', importantInput],
    status: [200, 400, 404],
  },
  'DELETE /api/exercises/:id': {
    summary: 'Delete an exercise with its stored files',
    status: [204, 400, 404, 502, 503],
  },
  'GET /api/exercises/:id/answer': {
    summary: 'Get the answer of an exercise, or null',
    status: [200, 400, 404],
  },
  'PUT /api/exercises/:id/answer': {
    summary: 'Write the answer of an exercise, replacing the existing one',
    body: ['ExerciseAnswer', answerInput],
    status: [200, 400, 404],
  },
  'DELETE /api/exercises/:id/answer': {
    summary: 'Delete the answer of an exercise',
    status: [204, 400, 404],
  },
  'GET /api/exercises/:id/translation': {
    summary: 'Get the saved translation of an exercise, or null',
    status: [200, 400, 404],
  },
  'POST /api/exercises/:id/translation': {
    summary: 'Translate an exercise and its answer with Claude and save the result',
    status: [200, 400, 404, 409, 415, 422, 429, 502, 503],
  },
};

type Layer = {
  route?: { path: string; methods: Record<string, boolean> };
  handle?: { stack?: Layer[] };
};

// The routes live in sub-routers mounted with app.use(prefix, router). Express keeps no mount path
// on the layer, so it is recorded while the app is built (see documentedApp).
const mounts = new WeakMap<object, string>();

// The app as the server builds it, with no database: routes are only registered, never called, so
// the pool is never used. Use this instead of createApp where the routes are listed.
export function documentedApp() {
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
export function registeredRoutes(app: express.Express) {
  return routesOf((app as unknown as { router: { stack: Layer[] } }).router.stack, '');
}

const statusText: Record<number, string> = {
  200: 'Success',
  201: 'Created',
  204: 'Success, no content',
  400: 'Input validation failed or a referenced item does not exist',
  401: 'Sign-in required (no session from the shared sign-in)',
  403: 'The X-Requested-With header the app sends is missing',
  404: 'No target',
  409: 'Duplicate, conflict, or the item is in use or in the wrong state',
  413: 'Request size limit exceeded',
  415: 'Unsupported content type or file type',
  422: 'The file or text cannot be processed',
  429: 'Too many requests to an external service',
  500: 'Server error',
  502: 'An external service (file storage, Claude) failed',
  503: 'An external service (sign-in, file storage, holidays, Claude) is unavailable or not configured',
};

const idParam = { type: 'integer', minimum: 1, maximum: 999_999_999_999_999 };
// Path parameters: ids are plain integers; the retrospective period is a kind and a start date.
function pathParam(name: string): Json {
  if (name === 'kind') return { type: 'string', enum: [...retrospectiveKinds] };
  if (name === 'start') return { type: 'string', format: 'date' };
  return /^id$|Id$/.test(name) ? idParam : { type: 'string' };
}

export function buildOpenApi(app: express.Express) {
  const routes = registeredRoutes(app);
  const missing = routes.filter((route) => !operations[route]);
  const extra = Object.keys(operations).filter((route) => !routes.includes(route));
  if (missing.length || extra.length)
    throw new Error(`OpenAPI operations differ from routes: +${missing} -${extra}`);
  const schemas: Json = {
    Error: {
      type: 'object',
      properties: { error: { type: 'string', description: 'English error message' } },
      required: ['error'],
    },
  };
  const paths: Record<string, Json> = {};
  for (const route of [...routes].sort()) {
    const [method, path] = route.split(' ');
    const op = operations[route];
    const parameters: Json[] = [...path.matchAll(/:(\w+)/g)].map(([, name]) => ({
      name,
      in: 'path',
      required: true,
      schema: pathParam(name),
    }));
    if (op.query) {
      const query = jsonSchema(op.query) as { properties: Json; required?: string[] };
      for (const [name, schema] of Object.entries(query.properties))
        parameters.push({ name, in: 'query', required: !!query.required?.includes(name), schema });
    }
    if (op.body) schemas[op.body[0]] = jsonSchema(op.body[1]);
    const [success, ...failures] = op.status;
    const responses: Json = { [success]: { description: statusText[success] } };
    for (const status of failures)
      responses[status] = {
        description: statusText[status],
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      };
    const key = path.replace(/:(\w+)/g, '{$1}');
    paths[key] ??= {};
    paths[key][method.toLowerCase()] = {
      summary: op.summary,
      ...(parameters.length ? { parameters } : {}),
      ...(op.body
        ? {
            requestBody: {
              required: true,
              content: {
                'application/json': { schema: { $ref: `#/components/schemas/${op.body[0]}` } },
              },
            },
          }
        : {}),
      responses,
    };
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Study Log API',
      version: '1.0.0',
      description:
        'Dates are YYYY-MM-DD (Asia/Seoul). Every error response is { error: English message }.',
    },
    servers: [{ url: '/' }],
    paths,
    components: { schemas },
  };
}
