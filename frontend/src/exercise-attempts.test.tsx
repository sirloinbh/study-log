import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { expect, test } from 'vitest';

import { ExerciseAttempts } from './exercise-attempts';
import { fakeApi } from './test/fake-api';
import { render } from './test/render';

const attempt = (id: number, date: string, result: 'correct' | 'wrong', hintUsed = false) => ({
  id,
  exerciseId: 7,
  date,
  result,
  hintUsed,
  note: '',
});

function serve(
  initial = [attempt(2, '2026-11-05', 'correct'), attempt(1, '2026-11-01', 'wrong', true)],
) {
  const rows = [...initial];
  return fakeApi({
    'GET /api/exercises/7/attempts': () => ({ body: { attempts: rows } }),
    'POST /api/exercises/7/attempts': (request) => {
      const body = request.body as { result: 'correct' | 'wrong'; hintUsed: boolean };
      rows.unshift(attempt(9, '2026-11-23', body.result, body.hintUsed));
      return { status: 201, body: { attempt: rows[0] } };
    },
    'DELETE /api/exercise-attempts/1': () => {
      rows.splice(
        rows.findIndex((r) => r.id === 1),
        1,
      );
      return { status: 204 };
    },
  });
}

const show = () => fireEvent.click(screen.getByRole('button', { name: '#7 show attempts' }));

test('nothing is requested until the panel is opened, then the history is listed newest first', async () => {
  const api = serve();
  render(<ExerciseAttempts exerciseId={7} label="#7" />);
  expect(api.requests).toHaveLength(0);
  show();
  const items = await screen.findAllByRole('listitem');
  expect(items.map((li) => li.textContent)).toEqual([
    '2026-11-05 · CorrectDeleteAsk Claude',
    '2026-11-01 · Wrong · hint usedDeleteAsk Claude',
  ]);
});

test('a result is recorded with the hint flag, then the list reloads', async () => {
  const api = serve([]);
  render(<ExerciseAttempts exerciseId={7} label="#7" />);
  show();
  expect(await screen.findByText('No attempts yet')).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('I used a hint'));
  fireEvent.click(screen.getByRole('button', { name: '#7 record wrong' }));
  expect(await screen.findByText('2026-11-23 · Wrong · hint used')).toBeInTheDocument();
  expect(api.sent).toMatchObject([
    {
      method: 'POST',
      path: '/api/exercises/7/attempts',
      body: { result: 'wrong', hintUsed: true },
    },
  ]);
  expect(screen.getByRole('status')).toHaveTextContent('Attempt recorded');
  expect(screen.getByLabelText('I used a hint')).not.toBeChecked();
});

test('deleting an attempt asks first, then removes it', async () => {
  const api = serve();
  render(<ExerciseAttempts exerciseId={7} label="#7" />);
  show();
  fireEvent.click(await screen.findByRole('button', { name: '#7 delete attempt of 2026-11-01' }));
  expect(api.sent).toHaveLength(0);
  fireEvent.click(
    within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }),
  );
  await waitFor(() => expect(screen.queryByText(/2026-11-01/)).not.toBeInTheDocument());
  expect(api.sent.map((r) => `${r.method} ${r.path}`)).toEqual(['DELETE /api/exercise-attempts/1']);
});

test('a failed record is announced', async () => {
  fakeApi({
    'GET /api/exercises/7/attempts': { body: { attempts: [] } },
    'POST /api/exercises/7/attempts': { status: 404, body: { error: 'Exercise not found' } },
  });
  render(<ExerciseAttempts exerciseId={7} label="#7" />);
  show();
  await screen.findByText('No attempts yet');
  fireEvent.click(screen.getByRole('button', { name: '#7 record correct' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not record the attempt: Exercise not found',
  );
});
