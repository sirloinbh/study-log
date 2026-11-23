// The API's operation table. The document is built by the managed standard/openapi.ts from Zod schemas
// (z.toJSONSchema). `npm run openapi -w backend` writes docs/openapi.json; a test fails when it is out of date or
// when the table and the registered routes differ.
import { z } from 'zod/v4';

import { calendarQuery } from './calendar.js';
import {
  attemptInput as codingAttemptInput,
  attemptUpdateInput as codingAttemptUpdateInput,
  problemInput,
  problemListQuery,
  problemUpdateInput,
} from './coding-problems.js';
import { attemptInput, wrongListQuery } from './exercise-attempts.js';
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
import { buildOpenApi, type Operation } from './standard/openapi.js';
import { patternQuery, statsPeriodQuery, studyTimeQuery, textbookQuery } from './stats.js';
import { studyLogInput, studyLogListQuery } from './study-logs.js';
import {
  contentBulkInput,
  contentCreateInput,
  contentOrderInput,
  contentUpdateInput,
} from './textbook-contents.js';
import { textbookInput } from './textbooks.js';

// The retrospective period is a kind and a start date; every other path parameter is an id.
const retrospectiveParams = { kind: z.enum(retrospectiveKinds), start: z.iso.date() };

// Every registered route must appear here exactly once (checked when building).
// Every route that reads an id, a body or a query also answers 400 when validation fails.
export const operations: Record<string, Operation> = {
  'GET /api/health': {
    summary: 'Check the server and database connection',
    status: [200, 500],
    public: true,
  },
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
    summary:
      'List open review rounds due today or earlier, with the exercises due for another try (exerciseReviews)',
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

  'GET /api/study-timer': {
    summary: 'Get the running timer with its studied seconds, or null',
    status: [200],
  },
  'POST /api/study-timer/start': { summary: 'Start the timer', status: [201, 409] },
  'POST /api/study-timer/pause': { summary: 'Pause the running timer', status: [200, 409] },
  'POST /api/study-timer/resume': { summary: 'Resume a paused timer', status: [200, 409] },
  'POST /api/study-timer/stop': {
    summary:
      'Stop the timer and create a done study log on its start day, leaving the paused time out of the duration',
    status: [201, 400, 404],
  },
  'DELETE /api/study-timer': {
    summary: 'Cancel the timer without a study log',
    status: [204, 404],
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
    summary: 'Replace a keyword; a left-out date keeps the stored date',
    body: ['Keyword', keywordInput],
    status: [200, 400, 404, 409],
  },
  'DELETE /api/keywords/:id': { summary: 'Delete a keyword', status: [204, 400, 404] },

  'GET /api/coding/solvedac/problems/:number': {
    summary: 'Look up a Baekjoon problem on solved.ac (title, tier, tags) to fill in the form',
    status: [200, 400, 404, 503],
  },
  'POST /api/coding/solvedac/import': {
    summary:
      'Add the Baekjoon problems the configured solved.ac handle has solved; recorded ones are skipped',
    status: [200, 503],
  },
  'GET /api/coding/problems': {
    summary: 'List coding problems with attempt counts; result and dates match the latest attempt',
    query: problemListQuery,
    status: [200, 400],
  },
  'GET /api/coding/problems/:id': {
    summary: 'Get a problem with its attempts',
    status: [200, 400, 404],
  },
  'POST /api/coding/problems': {
    summary:
      'Add a problem (site and ID are unique), with a first attempt and optionally a study log',
    body: ['CodingProblem', problemInput],
    status: [201, 400, 409],
  },
  'PUT /api/coding/problems/:id': {
    summary: 'Change the title and link of a problem',
    body: ['CodingProblemUpdate', problemUpdateInput],
    status: [200, 400, 404],
  },
  'DELETE /api/coding/problems/:id': {
    summary: 'Delete a problem and its attempts; study logs made from them stay',
    status: [204, 400, 404],
  },
  'POST /api/coding/problems/:id/attempts': {
    summary: 'Add an attempt; studyLog also records a study log of the same length',
    body: ['CodingAttempt', codingAttemptInput],
    status: [201, 400, 404],
  },
  'PUT /api/coding/attempts/:id': {
    summary: 'Replace an attempt; a left-out date keeps the stored date',
    body: ['CodingAttemptUpdate', codingAttemptUpdateInput],
    status: [200, 400, 404],
  },
  'DELETE /api/coding/attempts/:id': { summary: 'Delete an attempt', status: [204, 400, 404] },

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
    params: retrospectiveParams,
    summary:
      'Write the retrospective of a week (starting Sunday) or month (starting the 1st), replacing the existing one',
    body: ['Retrospective', retrospectiveInput],
    status: [200, 400],
  },
  'DELETE /api/retrospectives/:kind/:start': {
    params: retrospectiveParams,
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
  'GET /api/exercises/wrong': {
    summary:
      'List exercises whose latest attempt was wrong or used a hint, across textbooks, newest attempt first',
    query: wrongListQuery,
    status: [200, 400],
  },
  'GET /api/exercises/:id/attempts': {
    summary: 'List the attempts at an exercise, newest first',
    status: [200, 400, 404],
  },
  'POST /api/exercises/:id/attempts': {
    summary:
      'Record an attempt: correct or wrong, whether a hint was used, on a date (default today)',
    body: ['ExerciseAttempt', attemptInput],
    status: [201, 400, 404],
  },
  'DELETE /api/exercise-attempts/:id': { summary: 'Delete an attempt', status: [204, 400, 404] },
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

export const document = buildOpenApi({
  title: 'Study Log API',
  description:
    'Dates are YYYY-MM-DD (Asia/Seoul). Every error response is { error: English message }.',
  errorDescription: 'English error message',
  operations,
  statusText,
});
