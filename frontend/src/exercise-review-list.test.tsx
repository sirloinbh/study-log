import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { ExerciseReviewList } from './exercise-review-list';
import type { ExerciseReview } from './review';
import { fakeApi } from './test/fake-api';
import { render } from './test/render';

const item = (patch: Partial<ExerciseReview> = {}): ExerciseReview => ({
  exerciseId: 7,
  step: 2,
  dueDate: '2026-11-21',
  number: '3',
  body: 'Prove it.',
  textbookTitle: 'Linear algebra',
  contentTitle: 'Chapter 1',
  ...patch,
});

test('nothing is drawn without due exercises', () => {
  const { container } = render(
    <ExerciseReviewList items={[]} today="2026-11-23" onChanged={() => {}} />,
  );
  expect(container).toBeEmptyDOMElement();
});

test('each exercise shows where it is, its step and how late it is', () => {
  render(<ExerciseReviewList items={[item()]} today="2026-11-23" onChanged={() => {}} />);
  expect(
    screen.getByRole('heading', { name: 'Problems to practise again (1)' }),
  ).toBeInTheDocument();
  const row = screen.getByRole('listitem');
  expect(row).toHaveTextContent('Linear algebra > Chapter 1 · Problem 3');
  expect(row).toHaveTextContent('Step 2 of 4');
  expect(row).toHaveTextContent('2 days late');
  expect(row).toHaveTextContent('Prove it.');
});

test('the three buttons record the attempt for that exercise and tell the screen to reload', async () => {
  const api = fakeApi({
    'POST /api/exercises/7/attempts': { status: 201, body: { attempt: { id: 1 } } },
  });
  const onChanged = vi.fn();
  render(<ExerciseReviewList items={[item()]} today="2026-11-23" onChanged={onChanged} />);
  const name = 'Linear algebra > Chapter 1 · Problem 3';
  fireEvent.click(screen.getByRole('button', { name: `Solved with a hint: ${name}` }));
  await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: `Wrong: ${name}` }));
  await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole('button', { name: `Solved: ${name}` }));
  await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(3));
  expect(api.sent.map((r) => r.body)).toEqual([
    { result: 'correct', hintUsed: true },
    { result: 'wrong', hintUsed: false },
    { result: 'correct', hintUsed: false },
  ]);
  expect(screen.getByRole('status')).toHaveTextContent('Attempt recorded');
});

test('a failed record is announced and does not reload', async () => {
  fakeApi({
    'POST /api/exercises/7/attempts': { status: 404, body: { error: 'Exercise not found' } },
  });
  const onChanged = vi.fn();
  render(<ExerciseReviewList items={[item()]} today="2026-11-23" onChanged={onChanged} />);
  fireEvent.click(screen.getByRole('button', { name: /^Solved: / }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not record the attempt: Exercise not found',
  );
  expect(onChanged).not.toHaveBeenCalled();
});
