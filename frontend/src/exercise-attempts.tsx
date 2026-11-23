import { useState } from 'react';

import { Button } from './components/ui/button';
import { DeleteConfirm } from './delete-confirm';
import type { ExerciseAttempt } from './exercise';
import { apiKey, useApiMutation, useApiQuery } from './lib/query';
import { Loading } from './loading';

// How each try at one exercise went (#356): record "correct" or "wrong" (with a hint or not) and read
// the history, newest first. The list loads only when the panel is opened.
export function ExerciseAttempts({
  exerciseId,
  label,
  disabled = false,
}: {
  exerciseId: number;
  label: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const [deleting, setDeleting] = useState<number | undefined>(undefined);
  const [message, setMessage] = useState<{ kind: 'status' | 'alert'; text: string } | undefined>();

  const path = `/api/exercises/${exerciseId}/attempts`;
  const key = apiKey(path);
  const query = useApiQuery<{ attempts: ExerciseAttempt[] }>(key, path, {
    enabled: open,
    staleTime: 0,
  });
  const record = useApiMutation<unknown, 'correct' | 'wrong'>(
    (result) => ({ path, method: 'POST', body: { result, hintUsed } }),
    {
      invalidate: [key],
      onSuccess: () => {
        setHintUsed(false);
        setMessage({ kind: 'status', text: 'Attempt recorded' });
      },
      onError: (error) =>
        setMessage({ kind: 'alert', text: `Could not record the attempt: ${error.message}` }),
    },
  );
  const remove = useApiMutation<unknown, number>(
    (id) => ({ path: `/api/exercise-attempts/${id}`, method: 'DELETE' }),
    {
      invalidate: [key],
      onSuccess: () => setMessage({ kind: 'status', text: 'Attempt deleted' }),
      onError: (error) =>
        setMessage({ kind: 'alert', text: `Could not delete the attempt: ${error.message}` }),
    },
  );

  const attempts = query.data?.attempts;
  return (
    <section className="exercise-attempts" aria-label={`${label} attempts`}>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        aria-expanded={open}
        aria-label={`${label} ${open ? 'hide attempts' : 'show attempts'}`}
        onClick={() => setOpen(!open)}
      >
        {open ? 'Hide attempts' : 'Attempts'}
      </Button>
      {open && (
        <>
          <div className="log-actions">
            <label>
              <input
                type="checkbox"
                checked={hintUsed}
                onChange={(event) => setHintUsed(event.target.checked)}
              />{' '}
              I used a hint
            </label>
            <Button
              type="button"
              disabled={record.isPending}
              aria-label={`${label} record correct`}
              onClick={() => record.mutate('correct')}
            >
              Correct
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={record.isPending}
              aria-label={`${label} record wrong`}
              onClick={() => record.mutate('wrong')}
            >
              Wrong
            </Button>
          </div>
          {/* Always mounted so screen readers announce each new message. */}
          <p role="status" className="status">
            {message?.kind === 'status' ? message.text : ''}
          </p>
          {message?.kind === 'alert' && (
            <p role="alert" className="error">
              {message.text}
            </p>
          )}
          {query.error && attempts === undefined ? (
            <p role="alert" className="error">
              Could not load the attempts: {query.error.message}
            </p>
          ) : attempts === undefined ? (
            <Loading label="Loading the attempts" kind="text" />
          ) : attempts.length === 0 ? (
            <p className="status">No attempts yet</p>
          ) : (
            <ul className="attempt-list">
              {attempts.map((attempt) => (
                <li key={attempt.id}>
                  <span>
                    {attempt.date} · {attempt.result === 'correct' ? 'Correct' : 'Wrong'}
                    {attempt.hintUsed ? ' · hint used' : ''}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    aria-label={`${label} delete attempt of ${attempt.date}`}
                    onClick={() => setDeleting(attempt.id)}
                  >
                    Delete
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <DeleteConfirm
            open={deleting !== undefined}
            title="Delete this attempt?"
            onCancel={() => setDeleting(undefined)}
            onConfirm={async () => {
              const id = deleting;
              setDeleting(undefined);
              if (id !== undefined) await remove.mutateAsync(id).catch(() => undefined);
            }}
          />
        </>
      )}
    </section>
  );
}
