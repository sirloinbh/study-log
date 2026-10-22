import React, { useEffect, useState } from 'react';
import { requestJson, type RequestError } from './api';
import {
  contentPath,
  emptyExerciseForm,
  exerciseLabel,
  exerciseLimits,
  questionText,
  type Exercise,
  type ExerciseForm,
} from './exercise';
import { contentOptions, type ContentNode, type Textbook } from './textbook';

type Notice = { kind: 'status' | 'alert'; text: string; contentId: number } | undefined;

// The open editor: a new exercise (`id` undefined) or an edit of `id`.
type Editor = { contentId: number; id?: number; form: ExerciseForm };

// Exercises of one chapter or section, picked from the textbook's contents. State is tagged with
// its chapter, so picking another one never shows or edits the previous chapter's exercises.
// `treeFailed` means the contents could not be loaded, so there is nothing to pick from.
export function Exercises({
  textbook,
  tree,
  treeFailed,
}: {
  textbook: Textbook;
  tree?: ContentNode[];
  treeFailed?: boolean;
}) {
  const [chosen, setChosen] = useState<number>();
  const [loaded, setLoaded] = useState<{ contentId: number; exercises: Exercise[] }>();
  const [loadError, setLoadError] = useState<{ contentId: number; message: string }>();
  const [editor, setEditor] = useState<Editor>();
  const [deleting, setDeleting] = useState<{ contentId: number; id: number }>();
  const [notice, setNotice] = useState<Notice>(undefined);
  // One request at a time, including the reload after a change, like the contents card.
  const [busy, setBusy] = useState(false);
  // Set when the editor opens and after each add; the body takes focus once the field is enabled.
  const [wantFocus, setWantFocus] = useState(false);

  const options = tree ? contentOptions(tree) : [];
  // The picked chapter, or the first one when nothing is picked or it was deleted.
  const contentId = options.some((option) => option.id === chosen) ? chosen : options[0]?.id;

  const url = `/api/textbooks/${textbook.id}/contents/${contentId}/exercises`;

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
        if (current) setLoadError({ contentId, message: error.message });
      });
    return () => {
      current = false;
    };
  }, [textbook.id, contentId]);

  // `contentId` is undefined when there are no contents yet; nothing tagged matches it then.
  const mine = <T extends { contentId: number }>(state: T | undefined) =>
    state && state.contentId === contentId ? state : undefined;
  const exercises = mine(loaded)?.exercises;
  const error = mine(loadError)?.message;
  const open = mine(editor);
  const deletingId = mine(deleting)?.id;
  const shown = mine(notice);

  // Not `autoFocus`: after an add the field is still disabled until the reload finishes, and a
  // disabled field cannot take focus. Other changes (a delete) leave focus where it is.
  useEffect(() => {
    if (!wantFocus || busy) return;
    setWantFocus(false);
    document.getElementById('exercise-body')?.focus?.();
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
    if (busy) return;
    setBusy(true);
    try {
      await change();
    } catch (failure) {
      const { message, status } = failure as RequestError;
      say('alert', message);
      if (status === 404 && targetId !== undefined && targetId === open?.id) setEditor(undefined);
    } finally {
      await refresh();
      setBusy(false);
    }
  };

  const pick = (event: { target: { value: string } }) => {
    setChosen(Number(event.target.value));
    setNotice(undefined);
  };

  const startAdd = () => {
    if (contentId === undefined) return;
    setDeleting(undefined);
    setNotice(undefined);
    setEditor({ contentId, form: emptyExerciseForm() });
    setWantFocus(true);
  };

  const startEdit = (exercise: Exercise) => {
    setDeleting(undefined);
    setNotice(undefined);
    setEditor({
      contentId: exercise.contentId,
      id: exercise.id,
      form: { number: exercise.number, body: exercise.body, important: exercise.important },
    });
    setWantFocus(true);
  };

  const save = (event: { preventDefault(): void }) => {
    event.preventDefault();
    if (!open) return;
    void run(async () => {
      if (open.id === undefined) {
        await requestJson(url, { method: 'POST', body: open.form });
        say('status', '추가했습니다');
        // Stays open, empty, for typing the next exercise.
        setEditor({ ...open, form: emptyExerciseForm() });
        setWantFocus(true);
      } else {
        await requestJson(`/api/exercises/${open.id}`, { method: 'PUT', body: open.form });
        say('status', '수정했습니다');
        setEditor(undefined);
      }
    }, open.id);
  };

  const remove = (exercise: Exercise) =>
    run(async () => {
      try {
        await requestJson(`/api/exercises/${exercise.id}`, { method: 'DELETE' });
      } finally {
        setDeleting(undefined);
      }
      say('status', '삭제했습니다');
      if (open?.id === exercise.id) setEditor(undefined);
    }, exercise.id);

  // Copies the problem as a question for an AI. Without clipboard access (an older browser, or
  // permission refused) it says so, and the body stays on screen to select by hand.
  const copy = async (exercise: Exercise, label: string) => {
    const path = (tree && contentPath(tree, exercise.contentId)) ?? [];
    try {
      const clipboard = globalThis.navigator?.clipboard;
      if (!clipboard) throw new Error('no clipboard');
      await clipboard.writeText(questionText(textbook, path, exercise));
      say('status', `${label} 질문을 복사했습니다`);
    } catch {
      say('alert', '클립보드에 복사하지 못했습니다. 문제 본문을 직접 선택해 복사하세요');
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
        <h3>연습문제</h3>
        <button
          type="button"
          className="secondary"
          disabled={busy || exercises === undefined}
          onClick={startAdd}
        >
          문제 추가
        </button>
      </div>
      {treeFailed ? (
        <p className="status">목차를 불러오지 못해 단원을 고를 수 없습니다</p>
      ) : tree === undefined ? (
        <p className="status">목차를 불러오는 중…</p>
      ) : options.length === 0 ? (
        <p className="status">목차를 먼저 추가하면 장·절별로 문제를 입력할 수 있습니다</p>
      ) : (
        <>
          <div className="log-form exercise-picker">
            <label className="wide">
              단원
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
                {open.id === undefined ? '문제 추가' : '문제 수정'}
              </p>
              <label>
                문제 번호
                <input
                  maxLength={exerciseLimits.number}
                  placeholder="예: 3"
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
                중요 문제로 표시
              </label>
              <label className="wide">
                문제 본문
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
                  {open.id === undefined ? '추가' : '수정 저장'}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => setEditor(undefined)}
                >
                  {open.id === undefined ? '닫기' : '취소'}
                </button>
              </div>
            </form>
          )}
        </>
      )}
      {/* Always mounted so screen readers announce each new message. */}
      <p role="status" className="status">
        {shown?.kind === 'status' ? shown.text : ''}
      </p>
      {shown?.kind === 'alert' && (
        <p role="alert" className="error">
          {shown.text}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          연습문제를 불러오지 못했습니다: {error}
        </p>
      )}
      {contentId !== undefined &&
        (exercises === undefined ? (
          !error && <p className="status">불러오는 중…</p>
        ) : exercises.length === 0 ? (
          <p className="status">이 단원에 입력한 문제가 없습니다</p>
        ) : (
          <ul className="log-list exercise-list">
            {exercises.map((exercise, index) => {
              const label = exerciseLabel(exercise, index);
              return (
                <li key={exercise.id} className={open?.id === exercise.id ? 'editing' : ''}>
                  <div className="log-head">
                    <span className="log-date">{label}</span>
                    {exercise.important && <span className="badge important">중요</span>}
                  </div>
                  <p className="exercise-body">{exercise.body}</p>
                  <div className="log-actions">
                    {deletingId === exercise.id ? (
                      <>
                        <button
                          type="button"
                          className="danger"
                          disabled={busy}
                          aria-label={`${label} 삭제 확인`}
                          onClick={() => remove(exercise)}
                        >
                          삭제 확인
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          aria-label={`${label} 삭제 취소`}
                          onClick={() => setDeleting(undefined)}
                        >
                          취소
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="secondary"
                          aria-label={`${label} 질문 복사`}
                          onClick={() => copy(exercise, label)}
                        >
                          질문 복사
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          aria-label={`${label} 수정`}
                          onClick={() => startEdit(exercise)}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          aria-label={`${label} 삭제`}
                          onClick={() =>
                            setDeleting({ contentId: exercise.contentId, id: exercise.id })
                          }
                        >
                          삭제
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
