import React, { useEffect, useState } from 'react';

import { type RequestError, requestJson } from './api';
import { useBusy } from './busy';
import type { ExerciseTranslation as Translation } from './exercise';
import { Loading } from './loading';

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
    setNotice({ exerciseId: id, kind: 'status', text: 'Translating… this can take a few seconds' });
    try {
      const data = await requestJson<{ translation: Translation }>(
        `/api/exercises/${id}/translation`,
        // A JSON body: the API takes nothing else for this paid request.
        { method: 'POST', body: {} },
      );
      setLoaded({ exerciseId: id, translation: data.translation });
      setLoadError(undefined);
      setNotice({ exerciseId: id, kind: 'status', text: 'Translated' });
    } catch (failure) {
      setNotice({
        exerciseId: id,
        kind: 'alert',
        text: `Could not translate: ${(failure as RequestError).message}`,
      });
    } finally {
      end();
    }
  };

  return (
    <section
      className="exercise-answer exercise-translation"
      aria-label={`${label} Korean translation`}
    >
      <p className="answer-label">Korean translation</p>
      {error && translation === undefined ? (
        <p role="alert" className="error">
          Could not load the translation: {error}
        </p>
      ) : translation === undefined ? (
        <Loading label="Loading the translation" kind="text" />
      ) : translation === null ? (
        <p className="status">Not translated yet</p>
      ) : (
        <>
          {translation.stale && (
            <p className="error">
              The problem or answer changed after it was translated. Translate it again
            </p>
          )}
          <p className="exercise-body" lang="ko">
            {translation.body}
          </p>
          {translation.answer !== null && (
            <>
              <p className="answer-label">Answer translation</p>
              <p className="exercise-body" lang="ko">
                {translation.answer}
              </p>
            </>
          )}
          <p className="status">
            AI translation ({translation.model}, {translation.updatedAt}) can be wrong. Check it
            against the original
          </p>
        </>
      )}
      <button
        type="button"
        className="secondary"
        disabled={busy || (translation === undefined && !error)}
        aria-label={`${label} ${translation ? 'translate again' : 'translate'}`}
        onClick={() => void translate()}
      >
        {translation ? 'Translate again' : 'Translate'}
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
