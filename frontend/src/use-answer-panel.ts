import { useEffect, useState } from 'react';

import { type ExerciseAnswer } from './exercise';
import { type RequestError, requestJson } from './lib/api';

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
  const [answer, setAnswer] = useState<AnswerPanel>();
  const shown = mine(answer);

  // Loads the answer when its panel opens.
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

  // Opens the answer of an exercise, closing any other one, or closes it when it is open.
  const toggle = (exercise: { id: number; contentId: number }) => {
    clearNotice();
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

  const close = () => setAnswer(undefined);
  const startEdit = () => setAnswer((panel) => panel && { ...panel, draft: panel.body ?? '' });
  const cancelEdit = () => setAnswer((panel) => panel && { ...panel, draft: undefined });
  return { shown, toggle, change, save, close, startEdit, cancelEdit };
}
