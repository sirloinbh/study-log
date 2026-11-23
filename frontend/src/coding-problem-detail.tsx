import { useState } from 'react';

import {
  type Attempt,
  attemptBody,
  attemptIssue,
  draftOf,
  emptyAttempt,
  type ProblemRow,
  resultLabels,
} from './coding';
import { AttemptFields } from './coding-attempt-fields';
import { Button } from './components/ui/button';
import { ConfirmDialog } from './components/ui/confirm-dialog';
import { apiKey, useApiQuery } from './lib/query';
import { ButtonSpinner, Loading } from './loading';

// What the screen lets the detail do: run one change at a time and show its message.
export type Change = (
  name: string,
  request: { path: string; method: string; body?: object },
  done: string,
) => Promise<boolean>;

// The attempts of one problem, with an add form, an editor and delete for each.
export function CodingProblemDetail({
  problem,
  today,
  busy,
  action,
  change,
  onInvalid,
}: {
  problem: ProblemRow;
  today: string;
  busy: boolean;
  action: string | undefined;
  change: Change;
  onInvalid: (message: string) => void;
}) {
  const detail = useApiQuery<{ attempts: Attempt[] }>(
    apiKey('/api/coding', 'problem', problem.id),
    `/api/coding/problems/${problem.id}`,
    { staleTime: 0 },
  );
  const [adding, setAdding] = useState(() => emptyAttempt(today));
  const [editing, setEditing] = useState<{ id: number; draft: ReturnType<typeof draftOf> }>();

  const add = async (event: { preventDefault(): void }) => {
    event.preventDefault();
    const issue = attemptIssue(adding);
    if (issue) return onInvalid(issue);
    const saved = await change(
      'add-attempt',
      {
        path: `/api/coding/problems/${problem.id}/attempts`,
        method: 'POST',
        body: attemptBody(adding),
      },
      'Attempt added',
    );
    if (saved) setAdding(emptyAttempt(today));
  };

  const save = async (event: { preventDefault(): void }) => {
    event.preventDefault();
    if (!editing) return;
    const issue = attemptIssue(editing.draft, false);
    if (issue) return onInvalid(issue);
    const saved = await change(
      'save-attempt',
      {
        path: `/api/coding/attempts/${editing.id}`,
        method: 'PUT',
        body: attemptBody(editing.draft, false),
      },
      'Attempt updated',
    );
    if (saved) setEditing(undefined);
  };

  return (
    <div className="coding-detail" aria-label={`Attempts for ${problem.title}`}>
      {detail.error ? (
        <p role="alert" className="error">
          Could not load the attempts: {detail.error.message}
        </p>
      ) : detail.data === undefined ? (
        <Loading label="Loading the attempts" />
      ) : (
        <ul className="log-list">
          {detail.data.attempts.map((attempt) =>
            editing?.id === attempt.id ? (
              <li key={attempt.id} className="editing">
                <form className="log-form coding-form" onSubmit={(event) => void save(event)}>
                  <AttemptFields
                    draft={editing.draft}
                    idPrefix={`coding-edit-${attempt.id}`}
                    busy={busy}
                    withLog={false}
                    onChange={(patch) =>
                      setEditing(
                        (current) =>
                          current && { ...current, draft: { ...current.draft, ...patch } },
                      )
                    }
                  />
                  <div className="actions wide">
                    <Button type="submit" disabled={busy}>
                      <ButtonSpinner when={action === 'save-attempt'} />
                      Save attempt
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setEditing(undefined)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </li>
            ) : (
              <li key={attempt.id}>
                <div className="log-head">
                  <span className="log-date">{attempt.date}</span>
                  <span>{resultLabels[attempt.result]}</span>
                  {attempt.language && <span>{attempt.language}</span>}
                  {attempt.minutes !== null && <span>{attempt.minutes} min</span>}
                  {attempt.studyLogId !== null && <span>Study log recorded</span>}
                </div>
                {attempt.notes && <p className="log-memo">{attempt.notes}</p>}
                <div className="log-actions">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    aria-label={`${attempt.date} attempt edit`}
                    onClick={() => setEditing({ id: attempt.id, draft: draftOf(attempt) })}
                  >
                    Edit
                  </Button>
                  <ConfirmDialog
                    title="Delete this attempt?"
                    description="The study log made from it, if any, stays."
                    onConfirm={() =>
                      change(
                        'delete-attempt',
                        { path: `/api/coding/attempts/${attempt.id}`, method: 'DELETE' },
                        'Attempt deleted',
                      )
                    }
                    trigger={
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        aria-label={`${attempt.date} attempt delete`}
                      >
                        Delete
                      </Button>
                    }
                  />
                </div>
              </li>
            ),
          )}
        </ul>
      )}
      <form
        className="log-form coding-form"
        onSubmit={(event) => void add(event)}
        aria-label="Add an attempt"
      >
        <AttemptFields
          draft={adding}
          idPrefix={`coding-add-${problem.id}`}
          busy={busy}
          withLog
          onChange={(patch) => setAdding((current) => ({ ...current, ...patch }))}
        />
        <div className="actions wide">
          <Button type="submit" disabled={busy}>
            <ButtonSpinner when={action === 'add-attempt'} />
            Add attempt
          </Button>
        </div>
      </form>
    </div>
  );
}
