import React, { useEffect, useRef, useState } from 'react';

import { type RequestError, requestJson } from './api';
import { useBusy } from './busy';
import { ButtonSpinner, Loading } from './loading';
import { Memo } from './memo';
import { overdueDays, type Review, type ReviewRange, reviewRanges, reviewTitle } from './review';

// `reviewId` is the review an alert is about.
type Notice = { kind: 'status' | 'alert'; text: string; reviewId?: number } | undefined;
type Listed = { today: string; reviews: Review[] };
type Completed = { next: { round: number; dueDate: string } | null };
type Moved = { dueDate: string };

// The date being typed for one review.
type Editor = { id: number; dueDate: string };

const headingId = 'reviews-today';
const dateInputId = 'review-due-date';
const completeId = (review: Review) => `review-complete-${review.id}`;
const snoozeId = (review: Review) => `review-snooze-${review.id}`;
const editId = (review: Review) => `review-edit-${review.id}`;
const rangeId = (range: ReviewRange) => `review-range-${range}`;
const listPath = (range: ReviewRange) => `/api/reviews/${range}`;

// Reviews (#43, #45): rounds not yet completed, up to today, this week or all of them. Overdue ones
// stay until they are completed. Completing cannot be undone (docs/decisions/review-rules.md), so
// the next round's date is shown right after, and can be changed like any other.
export function Reviews({ onChange }: { onChange?: () => void }) {
  const [range, setRange] = useState<ReviewRange>('today');
  // Tagged with its range, so a slow answer for another range is never shown as this one's.
  const [loaded, setLoaded] = useState<Listed & { range: ReviewRange }>();
  const [loadError, setLoadError] = useState<{ range: ReviewRange; message: string }>();
  const [editor, setEditor] = useState<Editor>();
  const [notice, setNotice] = useState<Notice>(undefined);
  // One change at a time, including the reload after it.
  const { busy, action, nameNext, begin, end } = useBusy();
  // The element to focus once the change is done and the controls are enabled again.
  const [wantFocus, setWantFocus] = useState<string>();

  // Only the newest load counts, so a slower, older answer never brings back a review just changed.
  const newestLoad = useRef(0);
  const load = useRef(async (target: ReviewRange) => {
    const request = ++newestLoad.current;
    try {
      const data = await requestJson<Listed>(listPath(target));
      if (request !== newestLoad.current) return;
      setLoaded({ ...data, range: target });
      setLoadError(undefined);
      return data.reviews;
    } catch (failure) {
      if (request !== newestLoad.current) return;
      // A failure keeps the list on screen and reports that it could not be refreshed.
      setLoadError({ range: target, message: (failure as RequestError).message });
    }
  }).current;

  useEffect(() => {
    void load(range);
  }, [load, range]);

  // Back on the tab, which may have been left overnight or changed elsewhere (#142), the list matches
  // the badge again. While a change runs nothing is added: its own reload comes after it.
  useEffect(() => {
    if (busy) return;
    const onFocus = () => {
      // A review that leaves the list takes the focused control with it.
      const item = document.activeElement?.closest<HTMLElement>('[data-review-id]');
      if (!item) return void load(range);
      void load(range).then((reviews) => {
        const gone = reviews?.every((review) => String(review.id) !== item.dataset.reviewId);
        // Unless focus has moved on to another control meanwhile. Nothing focused is not that: the
        // list may have rendered already and removed the control.
        const active = document.activeElement;
        const movedOn = active && active !== document.body && !item.contains(active);
        if (gone && !movedOn) setWantFocus(headingId);
      });
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [busy, load, range]);

  useEffect(() => {
    if (!wantFocus || busy) return;
    setWantFocus(undefined);
    // A review can leave the list with its button: moved out of the range, or changed elsewhere.
    (document.getElementById(wantFocus) ?? document.getElementById(headingId))?.focus?.();
  }, [wantFocus, busy]);

  const shown = loaded?.range === range ? loaded : undefined;
  const error = loadError?.range === range ? loadError.message : undefined;
  const { heading, empty } = reviewRanges[range];

  // The review being given a new date left the list, changed elsewhere. Its form closes for good, or
  // it would come back with an old date when the review returns. This replaces an error about it, but
  // not one about another review. Focus is left to whoever moved it: see the tab return above.
  const editedGone = Boolean(
    shown && editor && shown.reviews.every((review) => review.id !== editor.id),
  );
  useEffect(() => {
    if (!editedGone) return;
    const closedId = editor?.id;
    setEditor(undefined);
    setNotice((current) =>
      current?.kind === 'alert' && current.reviewId !== closedId
        ? current
        : {
            kind: 'status',
            text: 'The review whose date you were changing left the list, so the input was closed',
          },
    );
  }, [editedGone, editor?.id]);

  // Runs one change, then reloads the list and has the badge count again. `done` is where focus
  // goes after it worked and `failed` after a failure that leaves the review in place. A 404 or
  // 409 means it was completed or removed elsewhere, so it leaves the list on the reload.
  const run = async (
    reviewId: number,
    change: () => Promise<void>,
    done: string,
    failed: string,
  ) => {
    if (!begin()) return;
    // Cleared first, so the same message twice in a row is still announced.
    setNotice(undefined);
    try {
      await change();
      setWantFocus(done);
    } catch (failure) {
      const { message, status } = failure as RequestError;
      setNotice({ kind: 'alert', text: message, reviewId });
      const gone = status === 404 || status === 409;
      if (gone) setEditor(undefined);
      setWantFocus(gone ? headingId : failed);
    } finally {
      await load(range);
      end();
      onChange?.();
    }
  };

  // Loads a failed list again. The old error goes first, so the same one coming back is announced
  // again, and an earlier change's error goes unless a date form it belongs to is still open.
  const retry = async () => {
    if (!begin()) return;
    setLoadError(undefined);
    if (!editor) setNotice(undefined);
    setWantFocus(rangeId(range));
    await load(range);
    end();
  };

  const complete = (review: Review) =>
    run(
      review.id,
      async () => {
        const { next } = await requestJson<Completed>(`/api/reviews/${review.id}/complete`, {
          method: 'POST',
        });
        setEditor(undefined);
        setNotice({
          kind: 'status',
          text: next
            ? `Review completed. The next review is on ${next.dueDate}`
            : 'Review completed. All reviews of this log are done',
        });
      },
      headingId,
      completeId(review),
    );

  const snooze = (review: Review) =>
    run(
      review.id,
      async () => {
        const { dueDate } = await requestJson<Moved>(`/api/reviews/${review.id}/snooze`, {
          method: 'POST',
        });
        setEditor(undefined);
        setNotice({ kind: 'status', text: `Postponed by a day. The new due date is ${dueDate}` });
      },
      snoozeId(review),
      snoozeId(review),
    );

  const saveDate = (event: { preventDefault(): void }, review: Review) => {
    event.preventDefault();
    if (!editor) return;
    nameNext('date');
    void run(
      review.id,
      async () => {
        const { dueDate } = await requestJson<Moved>(`/api/reviews/${review.id}/due-date`, {
          method: 'PUT',
          body: { dueDate: editor.dueDate },
        });
        setEditor(undefined);
        setNotice({ kind: 'status', text: `Changed the due date to ${dueDate}` });
      },
      editId(review),
      dateInputId,
    );
  };

  const pickRange = (next: ReviewRange) => {
    if (next === range) {
      // The range already shown: only a failed list has anything to gain, by trying again.
      if (error) void retry();
      return;
    }
    setRange(next);
    setEditor(undefined);
    setNotice(undefined);
  };

  const openEditor = (review: Review) => {
    setNotice(undefined);
    setEditor({ id: review.id, dueDate: review.dueDate });
    setWantFocus(dateInputId);
  };

  return (
    <div className="reviews">
      <section className="card" aria-label={heading}>
        <div className="log-actions" role="group" aria-label="View range">
          {(Object.keys(reviewRanges) as ReviewRange[]).map((key) => (
            <button
              key={key}
              type="button"
              id={rangeId(key)}
              className={key === range ? 'primary' : 'secondary'}
              aria-pressed={key === range}
              disabled={busy}
              onClick={() => pickRange(key)}
            >
              {reviewRanges[key].label}
            </button>
          ))}
        </div>
        <h2 id={headingId} className="reviews-heading" tabIndex={-1}>
          {heading}
          {shown && shown.reviews.length > 0 ? ` (${shown.reviews.length})` : ''}
        </h2>
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
            Could not load the reviews: {error}
          </p>
        )}
        {shown === undefined ? (
          !error && <Loading label="Loading the reviews" />
        ) : shown.reviews.length === 0 ? (
          <p className="status">{empty}</p>
        ) : (
          <ul className="log-list">
            {shown.reviews.map((review) => {
              const title = reviewTitle(review);
              const name = `${title} round ${review.round}`;
              const late = overdueDays(review.dueDate, shown.today);
              return (
                <li
                  key={review.id}
                  data-review-id={review.id}
                  className={editor?.id === review.id ? 'editing' : ''}
                >
                  <div className="log-head">
                    <span className="log-date">{title}</span>
                    <span className="badge">Round {review.round}</span>
                    {late > 0 && <span className="badge stopped">{late} days late</span>}
                  </div>
                  <p className="status">
                    Studied {review.studyDate} · due {review.dueDate}
                  </p>
                  {review.memo.trim() && <Memo text={review.memo} clamp />}
                  {editor?.id === review.id ? (
                    <form className="log-form" onSubmit={(event) => saveDate(event, review)}>
                      <label className="half">
                        New due date
                        <input
                          id={dateInputId}
                          type="date"
                          required
                          disabled={busy}
                          value={editor.dueDate}
                          onChange={(event) =>
                            setEditor({ id: review.id, dueDate: event.target.value })
                          }
                        />
                      </label>
                      <div className="actions wide">
                        <button
                          type="submit"
                          className="primary"
                          disabled={busy}
                          aria-label={`${name} save due date`}
                        >
                          <ButtonSpinner when={action === 'date'} />
                          Save
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          aria-label={`${name} cancel due date change`}
                          onClick={() => {
                            setEditor(undefined);
                            setWantFocus(editId(review));
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="log-actions">
                      <button
                        type="button"
                        className="primary"
                        id={completeId(review)}
                        disabled={busy}
                        aria-label={`${name} complete review`}
                        onClick={() => void complete(review)}
                      >
                        Complete review
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        id={snoozeId(review)}
                        disabled={busy}
                        aria-label={`${name} postpone a day`}
                        onClick={() => void snooze(review)}
                      >
                        Postpone a day
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        id={editId(review)}
                        disabled={busy}
                        aria-label={`${name} change date`}
                        onClick={() => openEditor(review)}
                      >
                        Change date
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
