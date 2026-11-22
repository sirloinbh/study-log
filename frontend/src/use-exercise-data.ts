import { useEffect, useState } from 'react';

import type { Exercise } from './exercise';
import { type RequestError, requestJson } from './lib/api';

// The API's answer for a chapter that does not exist (or belongs to another textbook).
const contentMissing = 'Contents entry not found';

// The exercises of one chapter, tagged with that chapter so a slow answer for another one is never
// shown. `refresh` reads them again (used after each change); `noteMissing` records a 404 about
// the chapter itself and tells the contents tree to reload (#74), and `lost` is that chapter.
export function useExerciseData({
  textbookId,
  contentId,
  reloadKey,
  onContentMissing,
}: {
  textbookId: number;
  contentId: number | undefined;
  reloadKey?: number;
  onContentMissing?: () => void;
}) {
  const [loaded, setLoaded] = useState<{ contentId: number; exercises: Exercise[] }>();
  const [loadError, setLoadError] = useState<{ contentId: number; message: string }>();
  // The chapter the server reported missing; once the reloaded tree no longer has it, the card
  // says so next to the first chapter it fell back to.
  const [lost, setLost] = useState<number>();
  const url = `/api/textbooks/${textbookId}/contents/${contentId}/exercises`;

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
      `/api/textbooks/${textbookId}/contents/${contentId}/exercises`,
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
  }, [textbookId, contentId, reloadKey]);

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

  return { loaded, loadError, lost, setLost, noteMissing, refresh, url };
}
