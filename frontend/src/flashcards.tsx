import { useEffect, useMemo, useState } from 'react';

import { Button } from './components/ui/button';
import type { RequestError } from './lib/api';
import { apiKey, useApiMutation, useApiQuery } from './lib/query';
import { ButtonSpinner, Loading } from './loading';
import { Memo } from './memo';
import { plural } from './plural';

type Card = { id: number; date: string; keyword: string; memo: string; known: boolean | null };
type Listed = { date: string; cards: Card[] };

const cardId = 'flashcard-keyword';

// Keyword flashcards (#359): the keywords noted on the study dates of the reviews due today, one at a
// time. Flip a card for its memo, then mark it known or not. The order is fixed when the cards load
// (not-known ones from earlier days first, done by the server), so answering never reshuffles them.
export function Flashcards({ today }: { today: string }) {
  const query = useApiQuery<Listed>(
    apiKey('/api/flashcards', today),
    `/api/flashcards?date=${today}`,
    {
      staleTime: 0,
    },
  );
  const cards = query.data?.cards;
  // Answers given on this screen, over what the server already had for today.
  const [given, setGiven] = useState<Record<number, boolean>>({});
  const [index, setIndex] = useState<number>();
  const [flipped, setFlipped] = useState(false);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const answer = useApiMutation<unknown, { id: number; known: boolean }>(({ id, known }) => ({
    path: `/api/flashcards/${id}`,
    method: 'PUT',
    body: { date: today, known },
  }));

  const knownOf = (card: Card) => given[card.id] ?? card.known;
  // Starts at the first card not answered today; all answered shows the result.
  const start = useMemo(() => {
    const first = cards?.findIndex((card) => card.known === null);
    return first === undefined ? undefined : first < 0 ? cards!.length : first;
  }, [cards]);
  const at = index ?? start;
  const done = cards !== undefined && at !== undefined && at >= cards.length;
  const card = cards && at !== undefined ? cards[at] : undefined;

  // After each card the keyword takes focus, so a keyboard user stays on the card.
  useEffect(() => {
    if (card) document.getElementById(cardId)?.focus?.();
  }, [card]);

  const mark = async (known: boolean) => {
    if (!card || saving) return;
    setSaving(true);
    setError(undefined);
    try {
      await answer.mutateAsync({ id: card.id, known });
      setGiven((current) => ({ ...current, [card.id]: known }));
      setFlipped(false);
      setIndex((at ?? 0) + 1);
    } catch (failure) {
      setError((failure as RequestError).message);
    } finally {
      setSaving(false);
    }
  };

  const restart = () => {
    setIndex(0);
    setFlipped(false);
  };

  const loadError = query.isFetching ? undefined : query.error?.message;
  const knownCount = cards?.filter((item) => knownOf(item) === true).length ?? 0;

  return (
    <div className="stats">
      <section className="card" aria-label="Flashcards">
        <h2>Flashcards</h2>
        {loadError && (
          <p role="alert" className="error">
            Could not load the flashcards: {loadError}{' '}
            <Button type="button" variant="outline" onClick={() => void query.refetch()}>
              Retry loading the flashcards
            </Button>
          </p>
        )}
        {cards === undefined ? (
          !loadError && <Loading label="Loading the flashcards" />
        ) : cards.length === 0 ? (
          <p className="status">
            No flashcards today: they are the keywords of the study days whose review is due.
          </p>
        ) : done ? (
          <div className="grid gap-3">
            <p role="status" className="status">
              All {plural(cards.length, 'card')} done: {knownCount} known,{' '}
              {cards.length - knownCount} to see again next time.
            </p>
            <div className="actions">
              <Button type="button" onClick={restart}>
                Go through them again
              </Button>
            </div>
          </div>
        ) : (
          card && (
            <div className="grid gap-3">
              <p role="status" className="status">
                Card {(at ?? 0) + 1} of {cards.length} · noted on {card.date}
                {knownOf(card) !== null &&
                  ` · answered today: ${knownOf(card) ? 'known' : 'not known'}`}
              </p>
              <h3
                id={cardId}
                tabIndex={-1}
                className="text-[22px] font-semibold [overflow-wrap:anywhere]"
              >
                {card.keyword}
              </h3>
              {flipped ? (
                card.memo ? (
                  <Memo text={card.memo} />
                ) : (
                  <p className="status">No memo for this keyword.</p>
                )
              ) : null}
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              <div className="actions">
                <Button
                  type="button"
                  variant="outline"
                  aria-pressed={flipped}
                  onClick={() => setFlipped((value) => !value)}
                >
                  {flipped ? 'Hide memo' : 'Show memo'}
                </Button>
                <Button type="button" disabled={saving} onClick={() => void mark(true)}>
                  <ButtonSpinner when={saving} />I knew it
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => void mark(false)}
                >
                  Not yet
                </Button>
              </div>
            </div>
          )
        )}
      </section>
    </div>
  );
}
