import React, { useEffect, useState } from 'react';
import { useBusy } from './busy';
import { requestJson, type RequestError } from './api';
import { contentPath, type Exercise } from './exercise';
import { contentLabel, contentOptions, type ContentNode, type Textbook } from './textbook';

type Notice = { kind: 'status' | 'alert'; text: string } | undefined;

// "1 벡터 > 1.2 내적 · 문제 3": where an exercise is, for a list that spans chapters.
export function importantLabel(tree: ContentNode[], exercise: Exercise) {
  const path = (contentPath(tree, exercise.contentId) ?? []).map(contentLabel).join(' > ');
  const number = exercise.number.trim() ? `문제 ${exercise.number.trim()}` : '번호 없는 문제';
  return path ? `${path} · ${number}` : number;
}

// The textbook's important exercises (#27), across all chapters or within one chapter and its
// sections. `reloadKey` changes when exercises were changed in the exercises card; `onChanged`
// is called after an exercise is unmarked here.
export function ImportantExercises({
  textbook,
  tree,
  treeFailed,
  reloadKey,
  onChanged,
}: {
  textbook: Textbook;
  tree?: ContentNode[];
  treeFailed?: boolean;
  reloadKey?: number;
  onChanged?: () => void;
}) {
  // 0 is the whole textbook.
  const [chosen, setChosen] = useState(0);
  const [loaded, setLoaded] = useState<{ scope: number; exercises: Exercise[] }>();
  const [loadError, setLoadError] = useState<{ scope: number; message: string }>();
  const [notice, setNotice] = useState<Notice>(undefined);
  const { busy, begin, end } = useBusy();

  const options = tree ? contentOptions(tree) : [];
  // The picked chapter, or the whole textbook when it was deleted.
  const scope = options.some((option) => option.id === chosen) ? chosen : 0;
  const url =
    `/api/textbooks/${textbook.id}/exercises?important=true` + (scope ? `&contentId=${scope}` : '');

  useEffect(() => {
    if (!tree) return;
    let current = true;
    requestJson<{ exercises: Exercise[] }>(url)
      .then((data) => {
        if (!current) return;
        setLoaded({ scope, exercises: data.exercises });
        setLoadError(undefined);
      })
      .catch((error: RequestError) => {
        if (current) setLoadError({ scope, message: error.message });
      });
    return () => {
      current = false;
    };
  }, [url, scope, reloadKey, tree]);

  const exercises = loaded?.scope === scope ? loaded.exercises : undefined;
  const error = loadError?.scope === scope ? loadError.message : undefined;

  const unmark = async (exercise: Exercise, label: string) => {
    if (!begin()) return;
    try {
      await requestJson(`/api/exercises/${exercise.id}/important`, {
        method: 'PATCH',
        body: { important: false },
      });
      setNotice({ kind: 'status', text: `${label} 중요 표시를 해제했습니다` });
    } catch (failure) {
      setNotice({ kind: 'alert', text: (failure as RequestError).message });
    } finally {
      try {
        const data = await requestJson<{ exercises: Exercise[] }>(url);
        setLoaded({ scope, exercises: data.exercises });
        setLoadError(undefined);
      } catch (failure) {
        setLoadError({ scope, message: (failure as RequestError).message });
      }
      end();
      onChanged?.();
    }
  };

  return (
    <div className="important-exercises">
      <div className="contents-head">
        <h3>중요 문제</h3>
      </div>
      {treeFailed ? (
        <p className="status">목차를 불러오지 못해 중요 문제를 모을 수 없습니다</p>
      ) : !tree ? (
        <p className="status">목차를 불러오는 중…</p>
      ) : (
        <div className="log-form exercise-picker">
          <label className="wide">
            범위
            <select
              disabled={busy}
              value={scope}
              onChange={(event) => {
                setChosen(Number(event.target.value));
                setNotice(undefined);
              }}
            >
              <option value={0}>교재 전체</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {/* Always mounted so screen readers announce each new message. */}
      <p role="status" className="status">
        {notice?.kind === 'status' ? notice.text : ''}
      </p>
      {notice?.kind === 'alert' && (
        <p role="alert" className="error">
          {notice.text}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          중요 문제를 불러오지 못했습니다: {error}
        </p>
      )}
      {tree &&
        (exercises === undefined ? (
          !error && <p className="status">불러오는 중…</p>
        ) : exercises.length === 0 ? (
          <p className="status">
            {scope ? '이 단원에 중요 표시한 문제가 없습니다' : '중요 표시한 문제가 없습니다'}
          </p>
        ) : (
          <ul className="log-list exercise-list">
            {exercises.map((exercise) => {
              const label = importantLabel(tree, exercise);
              return (
                <li key={exercise.id}>
                  <div className="log-head">
                    <span className="log-date">{label}</span>
                  </div>
                  <p className="exercise-body">{exercise.body}</p>
                  <div className="log-actions">
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      aria-label={`${label} 중요 해제`}
                      onClick={() => unmark(exercise, label)}
                    >
                      중요 해제
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ))}
    </div>
  );
}
