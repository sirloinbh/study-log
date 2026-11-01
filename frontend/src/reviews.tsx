import React, { useEffect, useRef, useState } from 'react';

import { type RequestError, requestJson } from './api';
import { useBusy } from './busy';
import { Memo } from './Memo';
import { overdueDays, type Review, type ReviewRange, reviewRanges, reviewTitle } from './review';

type Notice = { kind: 'status' | 'alert'; text: string } | undefined;
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
  const { busy, begin, end } = useBusy();
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
    const onFocus = () => void load(range);
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

  // Runs one change, then reloads the list and has the badge count again. `done` is where focus
  // goes after it worked and `failed` after a failure that leaves the review in place. A 404 or
  // 409 means it was completed or removed elsewhere, so it leaves the list on the reload.
  const run = async (change: () => Promise<void>, done: string, failed: string) => {
    if (!begin()) return;
    // Cleared first, so the same message twice in a row is still announced.
    setNotice(undefined);
    try {
      await change();
      setWantFocus(done);
    } catch (failure) {
      const { message, status } = failure as RequestError;
      setNotice({ kind: 'alert', text: message });
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
      async () => {
        const { next } = await requestJson<Completed>(`/api/reviews/${review.id}/complete`, {
          method: 'POST',
        });
        setEditor(undefined);
        setNotice({
          kind: 'status',
          text: next
            ? `복습을 완료했습니다. 다음 복습은 ${next.dueDate}입니다`
            : '복습을 완료했습니다. 이 기록의 복습을 모두 마쳤습니다',
        });
      },
      headingId,
      completeId(review),
    );

  const snooze = (review: Review) =>
    run(
      async () => {
        const { dueDate } = await requestJson<Moved>(`/api/reviews/${review.id}/snooze`, {
          method: 'POST',
        });
        setEditor(undefined);
        setNotice({ kind: 'status', text: `하루 미뤘습니다. 새 예정일은 ${dueDate}입니다` });
      },
      snoozeId(review),
      snoozeId(review),
    );

  const saveDate = (event: { preventDefault(): void }, review: Review) => {
    event.preventDefault();
    if (!editor) return;
    void run(
      async () => {
        const { dueDate } = await requestJson<Moved>(`/api/reviews/${review.id}/due-date`, {
          method: 'PUT',
          body: { dueDate: editor.dueDate },
        });
        setEditor(undefined);
        setNotice({ kind: 'status', text: `예정일을 ${dueDate}로 바꿨습니다` });
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
        <div className="log-actions" role="group" aria-label="조회 범위">
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
          {shown && shown.reviews.length > 0 ? ` ${shown.reviews.length}개` : ''}
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
            복습 목록을 불러오지 못했습니다: {error}
          </p>
        )}
        {shown === undefined ? (
          !error && <p className="status">불러오는 중…</p>
        ) : shown.reviews.length === 0 ? (
          <p className="status">{empty}</p>
        ) : (
          <ul className="log-list">
            {shown.reviews.map((review) => {
              const title = reviewTitle(review);
              const name = `${title} ${review.round}회차`;
              const late = overdueDays(review.dueDate, shown.today);
              return (
                <li key={review.id} className={editor?.id === review.id ? 'editing' : ''}>
                  <div className="log-head">
                    <span className="log-date">{title}</span>
                    <span className="badge">{review.round}회차</span>
                    {late > 0 && <span className="badge stopped">{late}일 지남</span>}
                  </div>
                  <p className="status">
                    학습일 {review.studyDate} · 예정일 {review.dueDate}
                  </p>
                  {review.memo.trim() && <Memo text={review.memo} clamp />}
                  {editor?.id === review.id ? (
                    <form className="log-form" onSubmit={(event) => saveDate(event, review)}>
                      <label className="half">
                        새 예정일
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
                          aria-label={`${name} 예정일 저장`}
                        >
                          저장
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          aria-label={`${name} 예정일 변경 취소`}
                          onClick={() => {
                            setEditor(undefined);
                            setWantFocus(editId(review));
                          }}
                        >
                          취소
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
                        aria-label={`${name} 복습 완료`}
                        onClick={() => void complete(review)}
                      >
                        복습 완료
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        id={snoozeId(review)}
                        disabled={busy}
                        aria-label={`${name} 하루 미루기`}
                        onClick={() => void snooze(review)}
                      >
                        하루 미루기
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        id={editId(review)}
                        disabled={busy}
                        aria-label={`${name} 날짜 변경`}
                        onClick={() => openEditor(review)}
                      >
                        날짜 변경
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
