import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import type { Exercise } from './exercise';
import { matchExercise } from './exercise';
import { ExerciseExtraction } from './exercise-extraction';

const url = '/api/textbooks/1/contents/10/exercises';
const exercise = (id: number, number: string): Exercise => ({
  id,
  textbookId: 1,
  contentId: 10,
  number,
  body: `Problem ${number}`,
  important: false,
});
const chapter = [exercise(1, '1.1'), exercise(2, '1.2'), exercise(3, '')];

type Sent = { method: string; path: string; body?: unknown; form?: FormData };

// Answers the extraction with `items` and every save with `saved`; keeps what was sent (#30).
function fakeServer(items: unknown[], saved: { status?: number; body?: unknown } = {}) {
  const sent: Sent[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (
        path: string,
        init: { method: string; headers?: Record<string, string>; body?: unknown },
      ) => {
        const form = init.body instanceof FormData ? init.body : undefined;
        sent.push({
          method: init.method,
          path,
          ...(form ? { form } : { body: JSON.parse(String(init.body)) as unknown }),
        });
        if (form) {
          expect(init.headers).toEqual({ 'x-requested-with': 'study-log' });
          return Promise.resolve(
            new Response(JSON.stringify({ items, model: 'claude-sonnet-5-5' })),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify(saved.body ?? {}), { status: saved.status ?? 200 }),
        );
      },
    ),
  );
  return sent;
}

function open() {
  const onSaved = vi.fn();
  render(
    <ExerciseExtraction
      url={url}
      exercises={chapter}
      disabled={false}
      onSaved={onSaved}
      onClose={() => {}}
    />,
  );
  return onSaved;
}

const pick = (name = 'page.pdf', bytes = '%PDF-1.7') =>
  fireEvent.change(screen.getByLabelText('PDF or photo (up to 20 MB)'), {
    target: { files: [new File([bytes], name, { type: 'application/pdf' })] },
  });

test('read problems are checked, edited and saved together with their answers', async () => {
  const sent = fakeServer([
    { number: '2.1', body: 'Add the vectors.', answer: '(3, 4)' },
    { number: '2.2', body: 'Find the inverse.', answer: null },
    { number: '', body: 'Not a problem', answer: null },
  ]);
  const onSaved = open();
  pick();
  fireEvent.click(screen.getByRole('button', { name: 'Read file' }));
  expect(await screen.findByText('Found 3. Check them before saving')).toBeInTheDocument();
  const [request] = sent;
  expect(request.path).toBe(`${url}/extract`);
  expect(request.form?.get('kind')).toBe('problems');
  expect((request.form?.get('file') as File).name).toBe('page.pdf');

  // Leave out the third, and fix the second one's text.
  const third = screen.getByRole('group', { name: 'Problem #3' });
  fireEvent.click(within(third).getByLabelText('Save this one'));
  const second = screen.getByRole('group', { name: 'Problem 2.2' });
  fireEvent.change(within(second).getByLabelText('Problem text'), {
    target: { value: 'Find the inverse of $A$.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save 2 problems' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('Saved 2 problems'));
  expect(sent[1]).toEqual({
    method: 'POST',
    path: `${url}/bulk`,
    body: {
      exercises: [
        { number: '2.1', body: 'Add the vectors.', answer: '(3, 4)' },
        { number: '2.2', body: 'Find the inverse of $A$.', answer: null },
      ],
    },
  });
});

test('answers go to the problem with the same number, and can be moved or left out', async () => {
  const sent = fakeServer([
    { number: '1.1.', body: '', answer: '(3, 4)' },
    { number: '9', body: '', answer: 'no match' },
    { number: '1.2', body: '', answer: '$A^{-1}$' },
  ]);
  const onSaved = open();
  pick('answers.pdf');
  fireEvent.click(screen.getByLabelText('Answers only, for problems already in this section'));
  fireEvent.click(screen.getByRole('button', { name: 'Read file' }));
  expect(await screen.findByText('Found 3. Check them before saving')).toBeInTheDocument();
  expect(sent[0].form?.get('kind')).toBe('answers');

  const target = (name: string) =>
    within(screen.getByRole('group', { name })).getByLabelText('Save to');
  expect(target('Answer 1.1.')).toHaveValue('1');
  expect(target('Answer 9')).toHaveValue('');
  expect(target('Answer 1.2')).toHaveValue('2');

  // Two answers on one problem cannot be saved.
  fireEvent.change(target('Answer 9'), { target: { value: '2' } });
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Two answers are matched to the same problem',
  );
  expect(screen.getByRole('button', { name: 'Save 3 answers' })).toBeDisabled();
  fireEvent.change(target('Answer 9'), { target: { value: '3' } });

  fireEvent.click(screen.getByRole('button', { name: 'Save 3 answers' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('Saved 3 answers'));
  expect(sent[1]).toEqual({
    method: 'PUT',
    path: `${url}/answers`,
    body: {
      answers: [
        { exerciseId: 1, body: '(3, 4)' },
        { exerciseId: 3, body: 'no match' },
        { exerciseId: 2, body: '$A^{-1}$' },
      ],
    },
  });
});

test('a failed save keeps the review and says why', async () => {
  fakeServer([{ number: '1', body: 'One', answer: null }], {
    status: 404,
    body: { error: 'Contents entry not found' },
  });
  const onSaved = open();
  pick();
  fireEvent.click(screen.getByRole('button', { name: 'Read file' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Save 1 problem' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not save: Contents entry not found',
  );
  expect(screen.getByRole('group', { name: 'Problem 1' })).toBeInTheDocument();
  expect(onSaved).not.toHaveBeenCalled();
});

test('no file, a file over 20 MB or an empty result is said plainly', async () => {
  const sent = fakeServer([]);
  open();
  fireEvent.click(screen.getByRole('button', { name: 'Read file' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Choose a PDF or photo first');
  const big = new File(['x'], 'big.pdf');
  Object.defineProperty(big, 'size', { value: 20 * 1024 * 1024 + 1 });
  fireEvent.change(screen.getByLabelText('PDF or photo (up to 20 MB)'), {
    target: { files: [big] },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Read file' }));
  expect(screen.getByRole('alert')).toHaveTextContent('The file must be at most 20 MB');
  expect(sent).toHaveLength(0);
  pick();
  fireEvent.click(screen.getByRole('button', { name: 'Read file' }));
  expect(await screen.findByText('No problems were found in this file')).toBeInTheDocument();
});

test('problem numbers match ignoring spaces, case and a trailing dot, and only when unique', () => {
  expect(matchExercise(' 1.2. ', chapter)?.id).toBe(2);
  expect(matchExercise('', chapter)).toBeUndefined();
  expect(matchExercise('12A', [exercise(5, '12a')])?.id).toBe(5);
  expect(matchExercise('4', [exercise(6, '4'), exercise(7, '4')])).toBeUndefined();
});
