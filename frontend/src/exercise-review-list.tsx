import { useState } from 'react';

import { Button } from './components/ui/button';
import { useApiMutation } from './lib/query';
import { plural } from './plural';
import type { ExerciseReview } from './review';
import { overdueDays } from './review';

type Result = { result: 'correct' | 'wrong'; hintUsed: boolean };

// The exercises I got wrong that are due for another try (#358), in the review list. Doing the
// problem again is recorded right here as an attempt (#356), which moves the exercise to its next
// step or restarts it (docs/decisions/review-rules.md chapter 7).
export function ExerciseReviewList({
  items,
  today,
  onChanged,
}: {
  items: ExerciseReview[];
  today: string;
  onChanged: () => void;
}) {
  const [message, setMessage] = useState<{ kind: 'status' | 'alert'; text: string } | undefined>();
  const record = useApiMutation<unknown, Result & { id: number }>(
    ({ id, ...body }) => ({ path: `/api/exercises/${id}/attempts`, method: 'POST', body }),
    {
      onSuccess: () => {
        setMessage({ kind: 'status', text: 'Attempt recorded' });
        onChanged();
      },
      onError: (error) =>
        setMessage({ kind: 'alert', text: `Could not record the attempt: ${error.message}` }),
    },
  );
  if (items.length === 0) return null;

  return (
    <section aria-label="Problems to practise again">
      <h3>Problems to practise again ({items.length})</h3>
      {/* Always mounted so screen readers announce each new message. */}
      <p role="status" className="status">
        {message?.kind === 'status' ? message.text : ''}
      </p>
      {message?.kind === 'alert' && (
        <p role="alert" className="error">
          {message.text}
        </p>
      )}
      <ul className="log-list">
        {items.map((item) => {
          const number = item.number.trim()
            ? `Problem ${item.number.trim()}`
            : 'Unnumbered problem';
          const name = `${item.textbookTitle} > ${item.contentTitle} · ${number}`;
          const late = overdueDays(item.dueDate, today);
          const send = (result: Result) => {
            setMessage(undefined);
            record.mutate({ id: item.exerciseId, ...result });
          };
          return (
            <li key={item.exerciseId}>
              <div className="log-head">
                <span className="log-date">{name}</span>
                <span className="badge">Step {item.step} of 4</span>
                {late > 0 && <span className="badge stopped">{plural(late, 'day')} late</span>}
              </div>
              <p className="exercise-body">{item.body}</p>
              <p className="status">Due {item.dueDate}</p>
              <div className="log-actions">
                <Button
                  type="button"
                  disabled={record.isPending}
                  aria-label={`Solved: ${name}`}
                  onClick={() => send({ result: 'correct', hintUsed: false })}
                >
                  Solved
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={record.isPending}
                  aria-label={`Solved with a hint: ${name}`}
                  onClick={() => send({ result: 'correct', hintUsed: true })}
                >
                  Solved with a hint
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={record.isPending}
                  aria-label={`Wrong: ${name}`}
                  onClick={() => send({ result: 'wrong', hintUsed: false })}
                >
                  Wrong
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
