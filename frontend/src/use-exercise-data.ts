import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import type { Exercise } from './exercise';
import type { RequestError } from './lib/api';
import { apiKey, useApiQuery } from './lib/query';

// The API's answer for a chapter that does not exist (or belongs to another textbook).
const contentMissing = 'Contents entry not found';

// The exercises of one chapter. The query key carries the chapter, so a slow answer for another
// one is never shown. `refresh` reads them again (used after each change); `noteMissing` records
// a 404 about the chapter itself and tells the contents tree to reload (#74), and `lost` is that
// chapter.
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
  const client = useQueryClient();
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

  // Always stale, so picking a chapter reads it again as it did before the query layer.
  const query = useApiQuery<{ exercises: Exercise[] }>(apiKey(url), url, {
    enabled: contentId !== undefined,
    staleTime: 0,
  });
  const { refetch } = query;

  // Exercises changed elsewhere (the important card): read them again, keeping what is shown.
  const lastReload = useRef(reloadKey);
  useEffect(() => {
    if (lastReload.current === reloadKey) return;
    lastReload.current = reloadKey;
    if (contentId !== undefined) void refetch();
    // Only a new reloadKey reads again; the chapter has its own key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  // A failed read that says the chapter is gone, once per answer and not again for a chapter
  // already reported by a failed change.
  const noted = useRef(noteMissing);
  noted.current = noteMissing;
  const lostRef = useRef(lost);
  lostRef.current = lost;
  const failure = query.error;
  useEffect(() => {
    if (!failure || contentId === undefined || lostRef.current === contentId) return;
    noted.current(failure, contentId);
    // Runs for a new failure only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failure]);

  const refresh = async () => {
    if (contentId === undefined) return;
    await client.invalidateQueries({ queryKey: apiKey(url) });
  };

  const loaded =
    contentId !== undefined && query.data
      ? { contentId, exercises: query.data.exercises }
      : undefined;
  const loadError =
    contentId !== undefined && query.error
      ? { contentId, message: query.error.message }
      : undefined;
  return { loaded, loadError, lost, setLost, noteMissing, refresh, url };
}
