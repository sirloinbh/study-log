import { fireEvent, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import type { WrongExercise } from './exercise';
import { fakeApi } from './test/fake-api';
import { render } from './test/render';
import { WrongExercises } from './wrong-exercises';

const row = (
  id: number,
  textbookId: number,
  patch: Partial<WrongExercise> = {},
): WrongExercise => ({
  id,
  textbookId,
  contentId: 10,
  number: String(id),
  body: `Body ${id}`,
  important: false,
  textbookTitle: textbookId === 1 ? 'Linear algebra' : 'Calculus',
  contentTitle: 'Chapter 1',
  lastAttemptDate: '2026-11-05',
  lastResult: 'wrong',
  hintUsed: false,
  ...patch,
});

const serve = () =>
  fakeApi({
    'GET /api/textbooks': {
      body: {
        textbooks: [
          { id: 1, title: 'Linear algebra', author: '', edition: '' },
          { id: 2, title: 'Calculus', author: '', edition: '' },
        ],
      },
    },
    'GET /api/exercises/wrong': (request) =>
      request.path.includes('textbookId=2')
        ? { body: { exercises: [row(2, 2)] } }
        : {
            body: {
              exercises: [row(1, 1, { lastResult: 'correct', hintUsed: true }), row(2, 2)],
            },
          },
  });

test('the list shows where each problem is and how the last try went', async () => {
  serve();
  render(<WrongExercises />);
  const items = await screen.findAllByRole('listitem');
  expect(items).toHaveLength(2);
  expect(items[0]).toHaveTextContent('Linear algebra > Chapter 1 · Problem 1');
  expect(items[0]).toHaveTextContent('Last try 2026-11-05: correct with a hint');
  expect(items[1]).toHaveTextContent('Last try 2026-11-05: wrong');
});

test('picking a textbook asks the server for that textbook only', async () => {
  const api = serve();
  render(<WrongExercises />);
  await screen.findAllByRole('listitem');
  fireEvent.change(await screen.findByLabelText('Textbook'), { target: { value: '2' } });
  await api.requested((r) => r.path === '/api/exercises/wrong?textbookId=2');
  expect(await screen.findAllByRole('listitem')).toHaveLength(1);
});

test('an empty list says how a problem gets here, and a failed load is announced', async () => {
  fakeApi({
    'GET /api/textbooks': { body: { textbooks: [] } },
    'GET /api/exercises/wrong': { body: { exercises: [] } },
  });
  const { unmount } = render(<WrongExercises />);
  expect(await screen.findByText(/No wrong problems/)).toBeInTheDocument();
  unmount();
  fakeApi({
    'GET /api/textbooks': { body: { textbooks: [] } },
    'GET /api/exercises/wrong': { status: 500, body: { error: 'Test server' } },
  });
  render(<WrongExercises />);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not load the wrong problems: Test server',
  );
});
