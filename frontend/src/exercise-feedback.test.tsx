import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { ExerciseFeedback } from './exercise-feedback';
import { fakeApi } from './test/fake-api';
import { render } from './test/render';

const saved = {
  id: 1,
  attemptId: 7,
  mode: 'hint' as const,
  solution: 'x',
  hasImage: false,
  feedback: 'Try induction.',
  model: 'm',
  createdAt: '2026-11-23 10:00',
};

function open(items = [saved]) {
  const onSaved = vi.fn();
  render(<ExerciseFeedback attemptId={7} label="1.1" items={items} onSaved={onSaved} />);
  fireEvent.click(screen.getByRole('button', { name: '1.1 ask Claude' }));
  return onSaved;
}

test('earlier feedback is shown, and a typed solution is sent for the chosen mode', async () => {
  const api = fakeApi({ 'POST /api/exercise-attempts/7/feedback': { body: { feedback: saved } } });
  const onSaved = open();
  expect(screen.getByText('Try induction.')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Your solution'), { target: { value: 'my steps' } });
  fireEvent.click(screen.getByRole('button', { name: '1.1 get grade' }));
  expect(await screen.findByText('Grade saved with this attempt')).toBeInTheDocument();
  const [request] = api.sent;
  expect(request.form?.get('mode')).toBe('grade');
  expect(request.form?.get('solution')).toBe('my steps');
  expect(request.headers).toEqual({ 'x-requested-with': 'study-log' });
  expect(onSaved).toHaveBeenCalled();
});

test('nothing is sent without a solution, or with a photo over 20 MB', () => {
  const api = fakeApi({});
  open([]);
  fireEvent.click(screen.getByRole('button', { name: '1.1 get hint' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Enter your solution or choose a photo');
  const big = new File(['x'], 'big.png');
  Object.defineProperty(big, 'size', { value: 20 * 1024 * 1024 + 1 });
  fireEvent.change(screen.getByLabelText(/Or a photo of it/), { target: { files: [big] } });
  fireEvent.click(screen.getByRole('button', { name: '1.1 get hint' }));
  expect(screen.getByRole('alert')).toHaveTextContent('at most 20 MB');
  expect(api.sent).toHaveLength(0);
});

test('a failure is said plainly and keeps what was typed', async () => {
  fakeApi({
    'POST /api/exercise-attempts/7/feedback': { status: 503, body: { error: 'Try again shortly' } },
  });
  const onSaved = open([]);
  fireEvent.change(screen.getByLabelText('Your solution'), { target: { value: 'mine' } });
  fireEvent.click(screen.getByRole('button', { name: '1.1 get explanation' }));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not get feedback: Try again shortly',
    ),
  );
  expect(screen.getByLabelText('Your solution')).toHaveValue('mine');
  expect(onSaved).not.toHaveBeenCalled();
});
