import React, { useEffect, useState } from 'react';

import { type RequestError, requestJson } from './api';
import { useBusy } from './busy';
import type { ExerciseTranslation as Translation } from './exercise';

type Notice = { exerciseId: number; kind: 'status' | 'alert'; text: string } | undefined;

// The Korean translation of one exercise and its answer, made by Claude on request (#31). State is
// tagged with its exercise, so opening another exercise's translation never shows this one's.
export function ExerciseTranslation({ exerciseId, label }: { exerciseId: number; label: string }) {
  const [loaded, setLoaded] = useState<{ exerciseId: number; translation: Translation | null }>();
  const [loadError, setLoadError] = useState<{ exerciseId: number; message: string }>();
  const [notice, setNotice] = useState<Notice>(undefined);
  // One translation request at a time: it can take several seconds.
  const { busy, begin, end } = useBusy();

  useEffect(() => {
    let current = true;
    requestJson<{ translation: Translation | null }>(`/api/exercises/${exerciseId}/translation`)
      .then((data) => {
        if (!current) return;
        setLoaded({ exerciseId, translation: data.translation });
        setLoadError(undefined);
      })
      .catch((error: RequestError) => {
        if (current) setLoadError({ exerciseId, message: error.message });
      });
    return () => {
      current = false;
    };
  }, [exerciseId]);

  const translation = loaded?.exerciseId === exerciseId ? loaded.translation : undefined;
  const error = loadError?.exerciseId === exerciseId ? loadError.message : undefined;
  const shown = notice?.exerciseId === exerciseId ? notice : undefined;

  const translate = async () => {
    if (!begin()) return;
    const id = exerciseId;
    setNotice({ exerciseId: id, kind: 'status', text: '번역하는 중… 몇 초 걸릴 수 있습니다' });
    try {
      const data = await requestJson<{ translation: Translation }>(
        `/api/exercises/${id}/translation`,
        // A JSON body: the API takes nothing else for this paid request.
        { method: 'POST', body: {} },
      );
      setLoaded({ exerciseId: id, translation: data.translation });
      setLoadError(undefined);
      setNotice({ exerciseId: id, kind: 'status', text: '번역했습니다' });
    } catch (failure) {
      setNotice({
        exerciseId: id,
        kind: 'alert',
        text: `번역하지 못했습니다: ${(failure as RequestError).message}`,
      });
    } finally {
      end();
    }
  };

  return (
    <section className="exercise-answer exercise-translation" aria-label={`${label} 한글 번역`}>
      <p className="answer-label">한글 번역</p>
      {error && translation === undefined ? (
        <p role="alert" className="error">
          번역을 불러오지 못했습니다: {error}
        </p>
      ) : translation === undefined ? (
        <p className="status">번역을 불러오는 중…</p>
      ) : translation === null ? (
        <p className="status">아직 번역하지 않았습니다</p>
      ) : (
        <>
          {translation.stale && (
            <p className="error">원문이나 정답이 번역한 뒤에 바뀌었습니다. 다시 번역하세요</p>
          )}
          <p className="exercise-body" lang="ko">
            {translation.body}
          </p>
          {translation.answer !== null && (
            <>
              <p className="answer-label">정답 번역</p>
              <p className="exercise-body" lang="ko">
                {translation.answer}
              </p>
            </>
          )}
          <p className="status">
            AI 번역({translation.model}, {translation.updatedAt})이라 틀릴 수 있습니다. 원문과 함께
            확인하세요
          </p>
        </>
      )}
      <button
        type="button"
        className="secondary"
        disabled={busy || (translation === undefined && !error)}
        aria-label={`${label} ${translation ? '다시 번역' : '번역하기'}`}
        onClick={() => void translate()}
      >
        {translation ? '다시 번역' : '번역하기'}
      </button>
      {/* Always mounted so screen readers announce each new message. */}
      <p role="status" className="status">
        {shown?.kind === 'status' ? shown.text : ''}
      </p>
      {shown?.kind === 'alert' && (
        <p role="alert" className="error">
          {shown.text}
        </p>
      )}
    </section>
  );
}
