import React, { useEffect, useState } from 'react';

import { type RequestError, requestJson } from './api';
import { useBusy } from './busy';
import { Memo } from './Memo';
import { overdueDays, type Review, reviewTitle } from './review';

type Notice = { kind: 'status' | 'alert'; text: string } | undefined;
type Today = { today: string; reviews: Review[] };
type Completed = { next: { round: number; dueDate: string } | null };

const headingId = 'reviews-today';
const completeId = (review: Review) => `review-complete-${review.id}`;

// Today's reviews (#43): rounds due today and earlier uncompleted ones, which stay until they are
// completed. Completing cannot be undone (docs/decisions/review-rules.md), so the next round's
// date is shown right after.
export function Reviews() {
  const [loaded, setLoaded] = useState<Today>();
  const [loadError, setLoadError] = useState<string>();
  const [notice, setNotice] = useState<Notice>(undefined);
  // One change at a time, including the reload after it.
  const { busy, begin, end } = useBusy();
  // The element to focus once the change is done and the controls are enabled again.
  const [wantFocus, setWantFocus] = useState<string>();

  useEffect(() => {
    let current = true;
    requestJson<Today>('/api/reviews/today')
      .then((data) => {
        if (!current) return;
        setLoaded(data);
        setLoadError(undefined);
      })
      .catch((error: RequestError) => {
        if (current) setLoadError(error.message);
      });
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    if (!wantFocus || busy) return;
    setWantFocus(undefined);
    // A review completed elsewhere leaves with its button, even after a failure here.
    (document.getElementById(wantFocus) ?? document.getElementById(headingId))?.focus?.();
  }, [wantFocus, busy]);

  // A failure keeps the list on screen and reports that it could not be refreshed.
  const reload = async () => {
    try {
      setLoaded(await requestJson<Today>('/api/reviews/today'));
      setLoadError(undefined);
    } catch (failure) {
      setLoadError((failure as RequestError).message);
    }
  };

  const complete = async (review: Review) => {
    if (!begin()) return;
    // Cleared first, so the same message twice in a row is still announced.
    setNotice(undefined);
    try {
      const { next } = await requestJson<Completed>(`/api/reviews/${review.id}/complete`, {
        method: 'POST',
      });
      setNotice({
        kind: 'status',
        text: next
          ? `복습을 완료했습니다. 다음 복습은 ${next.dueDate}입니다`
          : '복습을 완료했습니다. 이 기록의 복습을 모두 마쳤습니다',
      });
      // The button is gone; the heading keeps keyboard users' place.
      setWantFocus(headingId);
    } catch (failure) {
      const { message, status } = failure as RequestError;
      setNotice({ kind: 'alert', text: message });
      // Already completed or gone elsewhere: it leaves the list on reload, with its button.
      setWantFocus(status === 404 || status === 409 ? headingId : completeId(review));
    } finally {
      await reload();
      end();
    }
  };

  const today = loaded?.today;

  return (
    <div className="reviews">
      <section className="card" aria-label="오늘의 복습">
        <h2 id={headingId} tabIndex={-1}>
          오늘의 복습{loaded && loaded.reviews.length > 0 ? ` ${loaded.reviews.length}개` : ''}
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
        {loadError && (
          <p role="alert" className="error">
            복습 목록을 불러오지 못했습니다: {loadError}
          </p>
        )}
        {loaded === undefined ? (
          !loadError && <p className="status">불러오는 중…</p>
        ) : loaded.reviews.length === 0 ? (
          <p className="status">오늘 복습할 내용이 없습니다</p>
        ) : (
          <ul className="log-list">
            {loaded.reviews.map((review) => {
              const title = reviewTitle(review);
              const late = today ? overdueDays(review.dueDate, today) : 0;
              return (
                <li key={review.id}>
                  <div className="log-head">
                    <span className="log-date">{title}</span>
                    <span className="badge">{review.round}회차</span>
                    {late > 0 && <span className="badge stopped">{late}일 지남</span>}
                  </div>
                  <p className="status">
                    학습일 {review.studyDate} · 예정일 {review.dueDate}
                  </p>
                  {review.memo.trim() && <Memo text={review.memo} clamp />}
                  <div className="log-actions">
                    <button
                      type="button"
                      className="primary"
                      id={completeId(review)}
                      disabled={busy}
                      aria-label={`${title} ${review.round}회차 복습 완료`}
                      onClick={() => void complete(review)}
                    >
                      복습 완료
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
