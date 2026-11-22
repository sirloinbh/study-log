import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { type ExerciseAnswer } from './exercise';
import type { RequestError } from './lib/api';
import { apiKey, type ApiRequest, useApiMutation, useApiQuery } from './lib/query';

// The one exercise whose answer is shown. `body` is undefined while loading and null when no
// answer is saved; `draft` is set while the answer is being typed.
export type AnswerPanel = {
  contentId: number;
  id: number;
  body?: string | null;
  error?: string;
  draft?: string;
};

// The answer panel's state: opening it loads the answer, and only the panel it was loaded for is
// updated. The screen passes in how it runs a change (`run`, which reloads the list after) and
// says a message (`say`).
export function useAnswerPanel({
  mine,
  run,
  say,
  nameNext,
  clearNotice,
}: {
  mine: <T extends { contentId: number }>(state: T | undefined) => T | undefined;
  run: (change: () => Promise<void>) => Promise<void>;
  say: (kind: 'status' | 'alert', text: string) => void;
  nameNext: (name: string) => void;
  clearNotice: () => void;
}) {
  const client = useQueryClient();
  const [answer, setAnswer] = useState<AnswerPanel>();
  const send = useApiMutation<{ answer: ExerciseAnswer } | undefined, ApiRequest>((r) => r);
  const answerKey = (id: number) => apiKey(`/api/exercises/${id}/answer`);

  // Loads the answer when its panel opens. The key carries the exercise, so only the panel it
  // was loaded for shows it.
  const answerId = answer?.id;
  const query = useApiQuery<{ answer: ExerciseAnswer | null }>(
    answerKey(answerId ?? 0),
    `/api/exercises/${answerId}/answer`,
    { enabled: answerId !== undefined, staleTime: 0 },
  );
  const shown = mine(
    answer && {
      ...answer,
      body: query.data ? (query.data.answer?.body ?? null) : undefined,
      error: query.error?.message,
    },
  );

  // Opens the answer of an exercise, closing any other one, or closes it when it is open.
  const toggle = (exercise: { id: number; contentId: number }) => {
    clearNotice();
    // Reading it again from scratch: no old copy shows while it loads.
    client.removeQueries({ queryKey: answerKey(exercise.id) });
    setAnswer(
      shown?.id === exercise.id ? undefined : { contentId: exercise.contentId, id: exercise.id },
    );
  };

  const change = (event: { target: { value: string } }) => {
    clearNotice();
    setAnswer((panel) => panel && { ...panel, draft: event.target.value });
  };

  // Saves the typed answer. Saving it blank deletes the saved answer instead.
  const save = (event: { preventDefault(): void }) => {
    event.preventDefault();
    const panel = shown;
    if (panel?.draft === undefined) return;
    const draft = panel.draft;
    const path = `/api/exercises/${panel.id}/answer`;
    nameNext('answer');
    void run(async () => {
      if (draft.trim()) {
        const data = await send.mutateAsync({ path, method: 'PUT', body: { body: draft } });
        client.setQueryData(answerKey(panel.id), { answer: data?.answer ?? null });
        say('status', 'Saved the answer');
      } else if (panel.body) {
        try {
          await send.mutateAsync({ path, method: 'DELETE' });
        } catch (failure) {
          // Already deleted elsewhere: the answer is gone as asked. A missing exercise still fails.
          if ((failure as RequestError).message !== 'Answer not found') throw failure;
        }
        client.setQueryData(answerKey(panel.id), { answer: null });
        say('status', 'Cleared the answer');
      }
      setAnswer((current) =>
        current?.id === panel.id ? { ...current, draft: undefined } : current,
      );
    });
  };

  const close = () => {
    if (answerId !== undefined) client.removeQueries({ queryKey: answerKey(answerId) });
    setAnswer(undefined);
  };
  const startEdit = () => setAnswer((panel) => panel && { ...panel, draft: shown?.body ?? '' });
  const cancelEdit = () => setAnswer((panel) => panel && { ...panel, draft: undefined });
  return { shown, toggle, change, save, close, startEdit, cancelEdit };
}
