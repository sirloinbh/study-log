import React, { useState } from 'react';

import { type RequestError, requestForm, requestJson } from './api';
import { useBusy } from './busy';
import { type Exercise, exerciseLabel, exerciseLimits, matchExercise } from './exercise';
import { ButtonSpinner } from './loading';

type Kind = 'problems' | 'answers';
// What the API read from the file (#30). `body` is empty for an answers-only file.
type Item = { number: string; body: string; answer: string | null };

// One row of the review. Problems: saved when `include` is on. Answers: saved into `exerciseId`,
// or not at all when it is empty.
type ProblemRow = { key: number; include: boolean; number: string; body: string; answer: string };
type AnswerRow = { key: number; number: string; answer: string; exerciseId: string };
type Review = { kind: 'problems'; rows: ProblemRow[] } | { kind: 'answers'; rows: AnswerRow[] };

// Same bound as uploads (#28); the server checks it too.
const maxBytes = 20 * 1024 * 1024;
// The most the API takes in one save (app.ts).
const maxSaveBytes = 2 * 1024 * 1024;

// Reads the problems, or the answers, in one PDF or photo with Claude, shows them for review, and
// saves what the person keeps into the chapter at `url` (its exercises API). Rules:
// docs/decisions/extraction-rules.md. `onSaved` gets the message to show after a save.
export function ExerciseExtraction({
  url,
  exercises,
  disabled,
  onSaved,
  onClose,
}: {
  url: string;
  exercises: Exercise[];
  disabled: boolean;
  onSaved: (message: string) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<Kind>('problems');
  const [file, setFile] = useState<File>();
  const [review, setReview] = useState<Review>();
  const [notice, setNotice] = useState<{ kind: 'status' | 'alert'; text: string }>();
  const { busy: working, action, nameNext, begin, end } = useBusy();
  const busy = disabled || working;

  const read = async (event: { preventDefault(): void }) => {
    event.preventDefault();
    if (!file) return setNotice({ kind: 'alert', text: 'Choose a PDF or photo first' });
    if (file.size > maxBytes)
      return setNotice({ kind: 'alert', text: 'The file must be at most 20 MB' });
    nameNext('read');
    if (!begin()) return;
    setReview(undefined);
    setNotice({ kind: 'status', text: 'Reading the file… this can take a minute' });
    try {
      const form = new FormData();
      form.append('kind', kind);
      form.append('file', file);
      const { items } = await requestForm<{ items: Item[] }>(`${url}/extract`, form);
      setReview(
        kind === 'problems'
          ? {
              kind,
              rows: items.map((item, key) => ({
                key,
                include: true,
                number: item.number,
                body: item.body,
                answer: item.answer ?? '',
              })),
            }
          : {
              kind,
              rows: items.map((item, key) => ({
                key,
                number: item.number,
                answer: item.answer ?? '',
                exerciseId: String(matchExercise(item.number, exercises)?.id ?? ''),
              })),
            },
      );
      setNotice({
        kind: 'status',
        text: items.length
          ? `Found ${items.length}. Check them before saving`
          : `No ${kind} were found in this file`,
      });
    } catch (failure) {
      setNotice({
        kind: 'alert',
        text: `Could not read the file: ${(failure as RequestError).message}`,
      });
    } finally {
      end();
    }
  };

  // A review belongs to what the file was read as; reading it as something else starts over.
  const changeKind = (next: Kind) => {
    setKind(next);
    setReview(undefined);
    setNotice(undefined);
  };

  const editProblem = (key: number, change: Partial<ProblemRow>) =>
    setReview((current) =>
      current?.kind === 'problems'
        ? {
            ...current,
            rows: current.rows.map((row) => (row.key === key ? { ...row, ...change } : row)),
          }
        : current,
    );
  const editAnswer = (key: number, change: Partial<AnswerRow>) =>
    setReview((current) =>
      current?.kind === 'answers'
        ? {
            ...current,
            rows: current.rows.map((row) => (row.key === key ? { ...row, ...change } : row)),
          }
        : current,
    );

  const kept =
    review?.kind === 'problems'
      ? review.rows.filter((row) => row.include)
      : (review?.rows.filter((row) => row.exerciseId !== '') ?? []);

  // Problems the browser can already tell are wrong; the server checks them again.
  const problems: string[] = [];
  if (review?.kind === 'problems') {
    if (kept.length && (kept as ProblemRow[]).some((row) => !row.body.trim()))
      problems.push('Every problem to save needs its text');
  } else if (review) {
    const ids = (kept as AnswerRow[]).map((row) => row.exerciseId);
    if (new Set(ids).size !== ids.length)
      problems.push('Two answers are matched to the same problem');
    if ((kept as AnswerRow[]).some((row) => !row.answer.trim()))
      problems.push('Every answer to save needs its text');
  }

  const save = async () => {
    if (!review || !kept.length || problems.length) return;
    const body =
      review.kind === 'problems'
        ? {
            exercises: review.rows
              .filter((row) => row.include)
              .map((row) => ({
                number: row.number,
                body: row.body,
                answer: row.answer.trim() ? row.answer : null,
              })),
          }
        : {
            answers: review.rows
              .filter((row) => row.exerciseId !== '')
              .map((row) => ({ exerciseId: Number(row.exerciseId), body: row.answer })),
          };
    if (new Blob([JSON.stringify(body)]).size > maxSaveBytes)
      return setNotice({
        kind: 'alert',
        text: 'This is too much to save at once. Untick some, save, then read the file again for the rest',
      });
    nameNext('save');
    if (!begin()) return;
    try {
      await (review.kind === 'problems'
        ? requestJson(`${url}/bulk`, { method: 'POST', body })
        : requestJson(`${url}/answers`, { method: 'PUT', body }));
      end();
      onSaved(
        `Saved ${kept.length} ${review.kind === 'problems' ? 'problem' : 'answer'}${kept.length === 1 ? '' : 's'}`,
      );
    } catch (failure) {
      setNotice({ kind: 'alert', text: `Could not save: ${(failure as RequestError).message}` });
      end();
    }
  };

  return (
    <section className="exercise-extraction" aria-label="Read problems from a file">
      <form className="log-form" onSubmit={(event) => void read(event)}>
        <p className="wide content-form-heading">Read problems from a file</p>
        <p className="wide hint">
          Claude reads the file. Each reading is a paid request and can take up to a minute. Nothing
          is saved until you check the result.
        </p>
        <label className="wide">
          PDF or photo (up to 20 MB)
          <input
            type="file"
            accept="application/pdf,.pdf,image/jpeg,.jpg,.jpeg,image/png,.png"
            disabled={busy}
            onChange={(event) => setFile(event.target.files?.[0])}
          />
        </label>
        <fieldset className="wide extraction-kind">
          <legend>The file holds</legend>
          <label className="check">
            <input
              type="radio"
              name="extraction-kind"
              disabled={busy}
              checked={kind === 'problems'}
              onChange={() => changeKind('problems')}
            />
            Problems (with answers when they are shown)
          </label>
          <label className="check">
            <input
              type="radio"
              name="extraction-kind"
              disabled={busy}
              checked={kind === 'answers'}
              onChange={() => changeKind('answers')}
            />
            Answers only, for problems already in this section
          </label>
        </fieldset>
        <div className="actions wide">
          <button type="submit" className="primary" disabled={busy}>
            <ButtonSpinner when={action === 'read'} />
            Read file
          </button>
          <button type="button" className="secondary" disabled={working} onClick={onClose}>
            Close
          </button>
        </div>
      </form>
      <p role="status" className="status">
        {notice?.kind === 'status' ? notice.text : ''}
      </p>
      {notice?.kind === 'alert' && (
        <p role="alert" className="error">
          {notice.text}
        </p>
      )}
      {review && review.rows.length > 0 && (
        <div className="extraction-review">
          {review.kind === 'answers' && (
            <p className="hint">
              Each answer goes to the problem with the same number. Saving replaces an answer
              already entered.
            </p>
          )}
          <ol className="log-list">
            {review.kind === 'problems'
              ? review.rows.map((row, index) => {
                  const label = exerciseLabel(row, index);
                  return (
                    <li key={row.key}>
                      <fieldset className="log-form" disabled={busy}>
                        <legend>{label}</legend>
                        <label className="check wide">
                          <input
                            type="checkbox"
                            checked={row.include}
                            onChange={(event) =>
                              editProblem(row.key, { include: event.target.checked })
                            }
                          />
                          Save this one
                        </label>
                        <label>
                          Problem number
                          <input
                            maxLength={exerciseLimits.number}
                            value={row.number}
                            onChange={(event) =>
                              editProblem(row.key, { number: event.target.value })
                            }
                          />
                        </label>
                        <label className="wide">
                          Problem text
                          <textarea
                            rows={5}
                            value={row.body}
                            onChange={(event) => editProblem(row.key, { body: event.target.value })}
                          />
                        </label>
                        <label className="wide">
                          Answer (optional)
                          <textarea
                            rows={3}
                            value={row.answer}
                            onChange={(event) =>
                              editProblem(row.key, { answer: event.target.value })
                            }
                          />
                        </label>
                      </fieldset>
                    </li>
                  );
                })
              : review.rows.map((row, index) => {
                  const label = row.number.trim()
                    ? `Answer ${row.number.trim()}`
                    : `Answer #${index + 1}`;
                  return (
                    <li key={row.key}>
                      <fieldset className="log-form" disabled={busy}>
                        <legend>{label}</legend>
                        <label className="wide">
                          Save to
                          <select
                            value={row.exerciseId}
                            onChange={(event) =>
                              editAnswer(row.key, { exerciseId: event.target.value })
                            }
                          >
                            <option value="">Don&apos;t save</option>
                            {exercises.map((exercise, place) => (
                              <option key={exercise.id} value={exercise.id}>
                                {exerciseLabel(exercise, place)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="wide">
                          Answer
                          <textarea
                            rows={3}
                            value={row.answer}
                            onChange={(event) =>
                              editAnswer(row.key, { answer: event.target.value })
                            }
                          />
                        </label>
                      </fieldset>
                    </li>
                  );
                })}
          </ol>
          {problems.length > 0 && (
            <ul className="error" role="alert">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
          <div className="actions">
            <button
              type="button"
              className="primary"
              disabled={busy || !kept.length || problems.length > 0}
              onClick={() => void save()}
            >
              <ButtonSpinner when={action === 'save'} />
              {`Save ${kept.length} ${review.kind === 'problems' ? 'problem' : 'answer'}${kept.length === 1 ? '' : 's'}`}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                setReview(undefined);
                setNotice(undefined);
              }}
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
