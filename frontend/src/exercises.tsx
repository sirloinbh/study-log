import React, { useEffect, useState } from 'react';

import { useBusy } from './busy';
import {
  contentPath,
  emptyExerciseForm,
  type Exercise,
  type ExerciseForm,
  exerciseLabel,
  questionText,
} from './exercise';
import { ExerciseActions } from './exercise-actions';
import { ExerciseAnswerView } from './exercise-answer';
import { ExerciseExtraction } from './exercise-extraction';
import { ExerciseFormView } from './exercise-form';
import { ExerciseToolbar } from './exercise-toolbar';
import { ExerciseTranslation } from './exercise-translation';
import type { RequestError } from './lib/api';
import { type ApiRequest, useApiMutation } from './lib/query';
import { Loading } from './loading';
import { type ContentNode, contentOptions, type Textbook } from './textbook';
import { useAnswerPanel } from './use-answer-panel';
import { useExerciseData } from './use-exercise-data';

type Notice = { kind: 'status' | 'alert'; text: string; contentId: number } | undefined;

// The open editor: a new exercise (`id` undefined) or an edit of `id`.
type Editor = { contentId: number; id?: number; form: ExerciseForm };

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
  const [editor, setEditor] = useState<Editor>();
  const [deleting, setDeleting] = useState<{ contentId: number; id: number }>();
  // The one exercise whose Korean translation is shown (#31).
  const [translating, setTranslating] = useState<{ contentId: number; id: number }>();
  // The chapter whose "read from a file" panel is open (#30).
  const [reading, setReading] = useState<number>();
  const [notice, setNotice] = useState<Notice>(undefined);
  // One request at a time, including the reload after a change, like the contents card.
  const { busy, action, nameNext, begin, end } = useBusy();
  // The element to focus once the controls are enabled again: the body after an add, or along
  // the delete flow the confirm button, the delete button, or the card heading (#86).
  const [wantFocus, setWantFocus] = useState<string>();

  const options = tree ? contentOptions(tree) : [];
  // The picked chapter, or the first one when nothing is picked or it was deleted.
  const contentId = options.some((option) => option.id === chosen) ? chosen : options[0]?.id;

  // A plain JSON write; `run` reloads the list after it, while busy.
  const send = useApiMutation<unknown, ApiRequest>((request) => request);

  const { loaded, loadError, lost, setLost, noteMissing, refresh, url } = useExerciseData({
    textbookId: textbook.id,
    contentId,
    reloadKey,
    onContentMissing,
  });

  // `contentId` is undefined when there are no contents yet; nothing tagged matches it then.
  const mine = <T extends { contentId: number }>(state: T | undefined) =>
    state && state.contentId === contentId ? state : undefined;
  const exercises = mine(loaded)?.exercises;
  const error = mine(loadError)?.message;
  const open = mine(editor);
  const deletingId = mine(deleting)?.id;
  const shown = mine(notice);
  const translationShown = mine(translating)?.id;
  const readingShown = contentId !== undefined && reading === contentId;
  // The reported chapter is gone from the reloaded tree.
  const chapterGone =
    lost !== undefined && tree !== undefined && !options.some((option) => option.id === lost);

  // Not `autoFocus`: after an add the field is still disabled until the reload finishes, and a
  // disabled field cannot take focus.
  useEffect(() => {
    if (!wantFocus || busy) return;
    setWantFocus(undefined);
    document.getElementById(wantFocus)?.focus?.();
  }, [wantFocus, busy]);

  const say = (kind: 'status' | 'alert', text: string) =>
    contentId !== undefined && setNotice({ kind, text, contentId });

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

  const answerPanel = useAnswerPanel({
    mine,
    run,
    say,
    nameNext,
    clearNotice: () => setNotice(undefined),
  });
  const answerShown = answerPanel.shown;

  const pick = (event: { target: { value: string } }) => {
    setChosen(Number(event.target.value));
    setNotice(undefined);
    setLost(undefined);
    // Closed rather than hidden, so coming back loads the answer again instead of an old copy.
    answerPanel.close();
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
        await send.mutateAsync({ path: url, method: 'POST', body: open.form });
        say('status', 'Added');
        // Stays open, empty, for typing the next exercise.
        setEditor({ ...open, form: emptyExerciseForm() });
        setWantFocus('exercise-body');
      } else {
        await send.mutateAsync({
          path: `/api/exercises/${open.id}`,
          method: 'PUT',
          body: open.form,
        });
        say('status', 'Updated');
        setEditor(undefined);
      }
    }, open.id);
  };

  const remove = (exercise: Exercise) =>
    run(async () => {
      try {
        await send.mutateAsync({ path: `/api/exercises/${exercise.id}`, method: 'DELETE' });
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
      await send.mutateAsync({
        path: `/api/exercises/${exercise.id}/important`,
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
      <ExerciseToolbar
        disabled={busy || exercises === undefined}
        readingOpen={readingShown}
        onAdd={startAdd}
        onToggleReading={() => setReading(readingShown ? undefined : contentId)}
      />
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
            <ExerciseFormView
              key={open.id ?? 'new'}
              form={open.form}
              isNew={open.id === undefined}
              busy={busy}
              action={action}
              onSubmit={save}
              onChange={change}
              onToggleImportant={toggleImportant}
              onClose={() => setEditor(undefined)}
            />
          )}
          {readingShown && exercises && (
            <ExerciseExtraction
              key={contentId}
              url={url}
              exercises={exercises}
              disabled={busy}
              onSaved={(message) => {
                setReading(undefined);
                // The panel and its focused Save button are gone; focus goes back to its button.
                setWantFocus('exercise-read');
                // Nothing more to change: run reloads the list with the new problems or answers.
                void run(() => {
                  say('status', message);
                  return Promise.resolve();
                });
              }}
              onClose={() => {
                setReading(undefined);
                // The panel and its focused Close button are gone; focus goes back to its button.
                setWantFocus('exercise-read');
              }}
            />
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
                    <ExerciseAnswerView
                      panel={answerShown}
                      label={label}
                      busy={busy}
                      action={action}
                      onChange={answerPanel.change}
                      onSave={answerPanel.save}
                      onStartEdit={answerPanel.startEdit}
                      onCancelEdit={answerPanel.cancelEdit}
                    />
                  )}
                  <ExerciseActions
                    id={exercise.id}
                    label={label}
                    important={exercise.important}
                    confirming={deletingId === exercise.id}
                    answerOpen={answerShown?.id === exercise.id}
                    translationOpen={translationShown === exercise.id}
                    busy={busy}
                    action={action}
                    onConfirmDelete={() => {
                      nameNext('delete');
                      void remove(exercise);
                    }}
                    onCancelDelete={() => {
                      setDeleting(undefined);
                      setWantFocus(`exercise-delete-${exercise.id}`);
                    }}
                    onCopy={() => void copy(exercise, label)}
                    onToggleAnswer={() => answerPanel.toggle(exercise)}
                    onToggleTranslation={() =>
                      setTranslating(
                        translationShown === exercise.id
                          ? undefined
                          : { contentId: exercise.contentId, id: exercise.id },
                      )
                    }
                    onMarkImportant={() => void markImportant(exercise)}
                    onEdit={() => startEdit(exercise)}
                    onAskDelete={() => {
                      setDeleting({ contentId: exercise.contentId, id: exercise.id });
                      setWantFocus(`exercise-delete-confirm-${exercise.id}`);
                    }}
                  />
                </li>
              );
            })}
          </ul>
        ))}
    </div>
  );
}
