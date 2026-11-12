import React, { useEffect, useState } from 'react';

import { type RequestError, requestJson } from './api';
import { useBusy } from './busy';
import {
  contentPath,
  emptyExerciseForm,
  type Exercise,
  type ExerciseAnswer,
  type ExerciseForm,
  exerciseLabel,
  exerciseLimits,
  questionText,
} from './exercise';
import { ExerciseTranslation } from './exercise-translation';
import { ButtonSpinner, Loading } from './loading';
import { type ContentNode, contentOptions, type Textbook } from './textbook';

// The API's answer for a chapter that does not exist (or belongs to another textbook).
const contentMissing = 'Contents entry not found';

type Notice = { kind: 'status' | 'alert'; text: string; contentId: number } | undefined;

// The open editor: a new exercise (`id` undefined) or an edit of `id`.
type Editor = { contentId: number; id?: number; form: ExerciseForm };

// The one exercise whose answer is shown. `body` is undefined while loading and null when no
// answer is saved; `draft` is set while the answer is being typed.
type AnswerPanel = {
  contentId: number;
  id: number;
  body?: string | null;
  error?: string;
  draft?: string;
};

// Exercises of one chapter or section, picked from the textbook's contents. State is tagged with
// its chapter, so picking another one never shows or edits the previous chapter's exercises.
// `treeFailed` means the contents could not be loaded, so there is nothing to pick from.
// `reloadKey` changes when exercises were changed elsewhere (the important card); `onChanged` is
// called after each change made here. `onContentMissing` is called when the server says the
// picked chapter no longer exists (deleted elsewhere), so the contents tree can be reloaded (#74).
export function Exercises({
  textbook,
  tree,
  treeFailed,
  reloadKey,
  onChanged,
  onContentMissing,
}: {
  textbook: Textbook;
  tree?: ContentNode[];
  treeFailed?: boolean;
  reloadKey?: number;
  onChanged?: () => void;
  onContentMissing?: () => void;
}) {
  const [chosen, setChosen] = useState<number>();
  const [loaded, setLoaded] = useState<{ contentId: number; exercises: Exercise[] }>();
  const [loadError, setLoadError] = useState<{ contentId: number; message: string }>();
  const [editor, setEditor] = useState<Editor>();
  const [deleting, setDeleting] = useState<{ contentId: number; id: number }>();
  const [answer, setAnswer] = useState<AnswerPanel>();
  // The one exercise whose Korean translation is shown (#31).
  const [translating, setTranslating] = useState<{ contentId: number; id: number }>();
  const [notice, setNotice] = useState<Notice>(undefined);
  // One request at a time, including the reload after a change, like the contents card.
  const { busy, action, nameNext, begin, end } = useBusy();
  // The element to focus once the controls are enabled again: the body after an add, or along
  // the delete flow the confirm button, the delete button, or the card heading (#86).
  const [wantFocus, setWantFocus] = useState<string>();
  // The chapter the server reported missing; once the reloaded tree no longer has it, the card
  // says so next to the first chapter it fell back to.
  const [lost, setLost] = useState<number>();

  const options = tree ? contentOptions(tree) : [];
  // The picked chapter, or the first one when nothing is picked or it was deleted.
  const contentId = options.some((option) => option.id === chosen) ? chosen : options[0]?.id;

  const url = `/api/textbooks/${textbook.id}/contents/${contentId}/exercises`;

  // A 404 about the chapter itself, not about one exercise.
  const noteMissing = (failure: RequestError, id: number) => {
    if (failure.status !== 404 || failure.message !== contentMissing) return;
    setLost(id);
    onContentMissing?.();
  };

  useEffect(() => {
    if (contentId === undefined) return;
    let current = true;
    requestJson<{ exercises: Exercise[] }>(
      `/api/textbooks/${textbook.id}/contents/${contentId}/exercises`,
    )
      .then((data) => {
        if (!current) return;
        setLoaded({ contentId, exercises: data.exercises });
        setLoadError(undefined);
      })
      .catch((error: RequestError) => {
        if (!current) return;
        setLoadError({ contentId, message: error.message });
        noteMissing(error, contentId);
      });
    return () => {
      current = false;
    };
    // noteMissing only reads props and setters; the load reruns for chapter and reload changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textbook.id, contentId, reloadKey]);

  // `contentId` is undefined when there are no contents yet; nothing tagged matches it then.
  const mine = <T extends { contentId: number }>(state: T | undefined) =>
    state && state.contentId === contentId ? state : undefined;
  const exercises = mine(loaded)?.exercises;
  const error = mine(loadError)?.message;
  const open = mine(editor);
  const deletingId = mine(deleting)?.id;
  const shown = mine(notice);
  const answerShown = mine(answer);
  const translationShown = mine(translating)?.id;
  // The reported chapter is gone from the reloaded tree.
  const chapterGone =
    lost !== undefined && tree !== undefined && !options.some((option) => option.id === lost);

  // Loads the answer when its panel opens. Updates only the panel it was loaded for.
  const answerId = answer?.id;
  useEffect(() => {
    if (answerId === undefined) return;
    let current = true;
    const update = (change: Partial<AnswerPanel>) =>
      current && setAnswer((panel) => (panel?.id === answerId ? { ...panel, ...change } : panel));
    requestJson<{ answer: ExerciseAnswer | null }>(`/api/exercises/${answerId}/answer`)
      .then((data) => update({ body: data.answer?.body ?? null, error: undefined }))
      .catch((failure: RequestError) => update({ error: failure.message }));
    return () => {
      current = false;
    };
  }, [answerId]);

  // Not `autoFocus`: after an add the field is still disabled until the reload finishes, and a
  // disabled field cannot take focus.
  useEffect(() => {
    if (!wantFocus || busy) return;
    setWantFocus(undefined);
    document.getElementById(wantFocus)?.focus?.();
  }, [wantFocus, busy]);

  const say = (kind: 'status' | 'alert', text: string) =>
    contentId !== undefined && setNotice({ kind, text, contentId });

  const refresh = async () => {
    if (contentId === undefined) return;
    try {
      const data = await requestJson<{ exercises: Exercise[] }>(url);
      setLoaded({ contentId, exercises: data.exercises });
      setLoadError(undefined);
    } catch (failure) {
      setLoadError({ contentId, message: (failure as RequestError).message });
    }
  };

  // Runs one change and then reloads the list, both while busy. A 404 closes the editor only when
  // it is about the exercise being edited (`targetId`), so other unsaved input survives.
  const run = async (change: () => Promise<void>, targetId?: number) => {
    if (!begin()) return;
    try {
      await change();
    } catch (failure) {
      const { message, status } = failure as RequestError;
      say('alert', message);
      if (status === 404 && targetId !== undefined && targetId === open?.id) setEditor(undefined);
      if (contentId !== undefined) noteMissing(failure as RequestError, contentId);
    } finally {
      await refresh();
      end();
      onChanged?.();
    }
  };

  const pick = (event: { target: { value: string } }) => {
    setChosen(Number(event.target.value));
    setNotice(undefined);
    setLost(undefined);
    // Closed rather than hidden, so coming back loads the answer again instead of an old copy.
    setAnswer(undefined);
  };

  const startAdd = () => {
    if (contentId === undefined) return;
    setDeleting(undefined);
    setNotice(undefined);
    setEditor({ contentId, form: emptyExerciseForm() });
    setWantFocus('exercise-body');
  };

  const startEdit = (exercise: Exercise) => {
    setDeleting(undefined);
    setNotice(undefined);
    setEditor({
      contentId: exercise.contentId,
      id: exercise.id,
      form: { number: exercise.number, body: exercise.body, important: exercise.important },
    });
    setWantFocus('exercise-body');
  };

  const save = (event: { preventDefault(): void }) => {
    event.preventDefault();
    if (!open) return;
    nameNext('save');
    void run(async () => {
      if (open.id === undefined) {
        await requestJson(url, { method: 'POST', body: open.form });
        say('status', 'Added');
        // Stays open, empty, for typing the next exercise.
        setEditor({ ...open, form: emptyExerciseForm() });
        setWantFocus('exercise-body');
      } else {
        await requestJson(`/api/exercises/${open.id}`, { method: 'PUT', body: open.form });
        say('status', 'Updated');
        setEditor(undefined);
      }
    }, open.id);
  };

  const remove = (exercise: Exercise) =>
    run(async () => {
      try {
        await requestJson(`/api/exercises/${exercise.id}`, { method: 'DELETE' });
      } catch (failure) {
        // Already gone elsewhere: like a delete. Otherwise the exercise stays with its button.
        setWantFocus(
          (failure as RequestError).status === 404
            ? 'exercise-heading'
            : `exercise-delete-${exercise.id}`,
        );
        throw failure;
      } finally {
        setDeleting(undefined);
      }
      say('status', 'Deleted');
      setWantFocus('exercise-heading');
      if (open?.id === exercise.id) setEditor(undefined);
    }, exercise.id);

  // Marks or unmarks the exercise as important. An open edit of it follows, so saving the edit
  // does not undo the mark.
  const markImportant = (exercise: Exercise) =>
    run(async () => {
      const important = !exercise.important;
      await requestJson(`/api/exercises/${exercise.id}/important`, {
        method: 'PATCH',
        body: { important },
      });
      say('status', important ? 'Marked as important' : 'Removed the important mark');
      setEditor(
        (current) =>
          current &&
          (current.id === exercise.id
            ? { ...current, form: { ...current.form, important } }
            : current),
      );
    }, exercise.id);

  // Opens the answer of `exercise`, closing any other one, or closes it when it is open.
  const toggleAnswer = (exercise: Exercise) => {
    setNotice(undefined);
    setAnswer(
      answerShown?.id === exercise.id
        ? undefined
        : { contentId: exercise.contentId, id: exercise.id },
    );
  };

  const changeAnswer = (event: { target: { value: string } }) => {
    setNotice(undefined);
    setAnswer((panel) => panel && { ...panel, draft: event.target.value });
  };

  // Saves the typed answer. Saving it blank deletes the saved answer instead.
  const saveAnswer = (event: { preventDefault(): void }) => {
    event.preventDefault();
    const panel = answerShown;
    if (panel?.draft === undefined) return;
    const draft = panel.draft;
    const path = `/api/exercises/${panel.id}/answer`;
    nameNext('answer');
    void run(async () => {
      let body: string | null;
      if (draft.trim()) {
        const data = await requestJson<{ answer: ExerciseAnswer }>(path, {
          method: 'PUT',
          body: { body: draft },
        });
        body = data.answer.body;
        say('status', 'Saved the answer');
      } else if (panel.body) {
        try {
          await requestJson(path, { method: 'DELETE' });
        } catch (failure) {
          // Already deleted elsewhere: the answer is gone as asked. A missing exercise still fails.
          if ((failure as RequestError).message !== 'Answer not found') throw failure;
        }
        body = null;
        say('status', 'Cleared the answer');
      } else {
        body = null;
      }
      setAnswer((current) =>
        current?.id === panel.id ? { ...current, body, draft: undefined } : current,
      );
    });
  };

  // Copies the problem as a question for an AI. Without clipboard access (an older browser, or
  // permission refused) it says so, and the body stays on screen to select by hand.
  const copy = async (exercise: Exercise, label: string) => {
    const path = (tree && contentPath(tree, exercise.contentId)) ?? [];
    try {
      const clipboard = globalThis.navigator?.clipboard;
      if (!clipboard) throw new Error('no clipboard');
      await clipboard.writeText(questionText(textbook, path, exercise));
      say('status', `Copied the question for ${label}`);
    } catch {
      say('alert', 'Could not copy to the clipboard. Select and copy the problem text yourself');
    }
  };

  const change = (field: 'number' | 'body') => (event: { target: { value: string } }) => {
    setNotice(undefined);
    setEditor(
      (current) =>
        current && { ...current, form: { ...current.form, [field]: event.target.value } },
    );
  };

  const toggleImportant = (event: { target: { checked: boolean } }) => {
    setNotice(undefined);
    setEditor(
      (current) =>
        current && { ...current, form: { ...current.form, important: event.target.checked } },
    );
  };

  return (
    <div className="exercises">
      <div className="contents-head">
        <h3 id="exercise-heading" tabIndex={-1}>
          Exercises
        </h3>
        <button
          type="button"
          className="secondary"
          disabled={busy || exercises === undefined}
          onClick={startAdd}
        >
          Add problem
        </button>
      </div>
      {treeFailed ? (
        <p className="status">Could not load the contents, so a section cannot be chosen</p>
      ) : tree === undefined ? (
        <Loading label="Loading the contents" kind="text" />
      ) : options.length === 0 ? (
        <p className="status">Add contents first to enter problems by chapter and section</p>
      ) : (
        <>
          <div className="log-form exercise-picker">
            <label className="wide">
              Section
              <select disabled={busy} value={contentId} onChange={pick}>
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {open && (
            <form key={open.id ?? 'new'} className="log-form exercise-form" onSubmit={save}>
              <p className="wide content-form-heading">
                {open.id === undefined ? 'Add problem' : 'Edit problem'}
              </p>
              <label>
                Problem number
                <input
                  maxLength={exerciseLimits.number}
                  placeholder="e.g. 3"
                  disabled={busy}
                  value={open.form.number}
                  onChange={change('number')}
                />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={open.form.important}
                  onChange={toggleImportant}
                />
                Mark as important
              </label>
              <label className="wide">
                Problem text
                <textarea
                  id="exercise-body"
                  required
                  rows={6}
                  maxLength={exerciseLimits.body}
                  disabled={busy}
                  value={open.form.body}
                  onChange={change('body')}
                />
              </label>
              <div className="actions wide">
                <button type="submit" className="primary" disabled={busy}>
                  <ButtonSpinner when={action === 'save'} />
                  {open.id === undefined ? 'Add' : 'Save changes'}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => setEditor(undefined)}
                >
                  {open.id === undefined ? 'Close' : 'Cancel'}
                </button>
              </div>
            </form>
          )}
        </>
      )}
      {/* Always mounted so screen readers announce each new message. */}
      <p role="status" className="status">
        {shown?.kind === 'status'
          ? shown.text
          : chapterGone
            ? `The selected section was deleted elsewhere. ${options.length ? 'Showing the first section' : ''}`.trim()
            : ''}
      </p>
      {shown?.kind === 'alert' && (
        <p role="alert" className="error">
          {shown.text}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          Could not load the exercises: {error}
        </p>
      )}
      {contentId !== undefined &&
        (exercises === undefined ? (
          !error && <Loading label="Loading the exercises" />
        ) : exercises.length === 0 ? (
          <p className="status">No problems entered for this section</p>
        ) : (
          <ul className="log-list exercise-list">
            {exercises.map((exercise, index) => {
              const label = exerciseLabel(exercise, index);
              return (
                <li key={exercise.id} className={open?.id === exercise.id ? 'editing' : ''}>
                  <div className="log-head">
                    <span className="log-date">{label}</span>
                    {exercise.important && <span className="badge important">Important</span>}
                  </div>
                  <p className="exercise-body">{exercise.body}</p>
                  {translationShown === exercise.id && (
                    <ExerciseTranslation exerciseId={exercise.id} label={label} />
                  )}
                  {answerShown?.id === exercise.id && (
                    <div className="exercise-answer">
                      {answerShown.draft !== undefined ? (
                        <form className="log-form answer-form" onSubmit={saveAnswer}>
                          <label className="wide">
                            Answer
                            <textarea
                              id="answer-body"
                              // eslint-disable-next-line jsx-a11y-x/no-autofocus -- this field opens on a click, so focus follows that action.
                              autoFocus
                              rows={4}
                              maxLength={exerciseLimits.answer}
                              disabled={busy}
                              value={answerShown.draft}
                              onChange={changeAnswer}
                            />
                          </label>
                          <p className="wide status">Saving it empty clears the answer</p>
                          <div className="actions wide">
                            <button type="submit" className="primary" disabled={busy}>
                              <ButtonSpinner when={action === 'answer'} />
                              Save answer
                            </button>
                            <button
                              type="button"
                              className="secondary"
                              disabled={busy}
                              onClick={() =>
                                setAnswer((panel) => panel && { ...panel, draft: undefined })
                              }
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : answerShown.error ? (
                        <p role="alert" className="error">
                          Could not load the answer: {answerShown.error}
                        </p>
                      ) : answerShown.body === undefined ? (
                        <Loading label="Loading the answer" kind="text" />
                      ) : (
                        <>
                          <p className="answer-label">Answer</p>
                          {answerShown.body === null ? (
                            <p className="status">No answer entered</p>
                          ) : (
                            <p className="exercise-body">{answerShown.body}</p>
                          )}
                          <button
                            type="button"
                            className="secondary"
                            disabled={busy}
                            aria-label={`${label} ${answerShown.body === null ? 'add answer' : 'edit answer'}`}
                            onClick={() =>
                              setAnswer((panel) => panel && { ...panel, draft: panel.body ?? '' })
                            }
                          >
                            {answerShown.body === null ? 'Add answer' : 'Edit answer'}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  <div className="log-actions">
                    {deletingId === exercise.id ? (
                      <>
                        <button
                          type="button"
                          id={`exercise-delete-confirm-${exercise.id}`}
                          className="danger"
                          disabled={busy}
                          aria-label={`${label} confirm deletion`}
                          onClick={() => {
                            nameNext('delete');
                            void remove(exercise);
                          }}
                        >
                          <ButtonSpinner when={action === 'delete'} />
                          Confirm delete
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          aria-label={`${label} cancel deletion`}
                          onClick={() => {
                            setDeleting(undefined);
                            setWantFocus(`exercise-delete-${exercise.id}`);
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="secondary"
                          aria-label={`${label} copy question`}
                          onClick={() => void copy(exercise, label)}
                        >
                          Copy question
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          aria-expanded={answerShown?.id === exercise.id}
                          aria-label={`${label} ${answerShown?.id === exercise.id ? 'hide answer' : 'show answer'}`}
                          onClick={() => toggleAnswer(exercise)}
                        >
                          {answerShown?.id === exercise.id ? 'Hide answer' : 'Show answer'}
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          aria-expanded={translationShown === exercise.id}
                          aria-label={`${label} ${translationShown === exercise.id ? 'hide translation' : 'show translation'}`}
                          onClick={() =>
                            setTranslating(
                              translationShown === exercise.id
                                ? undefined
                                : { contentId: exercise.contentId, id: exercise.id },
                            )
                          }
                        >
                          {translationShown === exercise.id
                            ? 'Hide translation'
                            : 'Show translation'}
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          aria-label={`${label} ${exercise.important ? 'unmark important' : 'mark important'}`}
                          onClick={() => void markImportant(exercise)}
                        >
                          {exercise.important ? 'Unmark important' : 'Mark important'}
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          aria-label={`${label} edit`}
                          onClick={() => startEdit(exercise)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          id={`exercise-delete-${exercise.id}`}
                          aria-label={`${label} delete`}
                          onClick={() => {
                            setDeleting({ contentId: exercise.contentId, id: exercise.id });
                            setWantFocus(`exercise-delete-confirm-${exercise.id}`);
                          }}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ))}
    </div>
  );
}
