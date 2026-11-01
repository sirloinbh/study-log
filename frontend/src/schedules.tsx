import { useEffect, useState } from 'react';

import { type RequestError, requestJson } from './api';
import { useBusy } from './busy';
import { ButtonSpinner, Loading } from './loading';
import {
  dayLabel,
  defaultEnd,
  defaultHours,
  hoursToMinutes,
  type Schedule,
  type ScheduleDetail,
} from './schedule';
import { formatMinutes } from './study-logs-data';
import { contentLabel, type ContentNode, type Textbook } from './textbook';

type Notice = { kind: 'status' | 'alert'; text: string } | undefined;

// Study schedules (#35): a form that makes one from a period and daily hours, the schedules there
// are, and the days of the one picked. A schedule's period and hours do not change once it is made
// (docs/decisions/schedule-rules.md 5장), so this offers deleting rather than editing them.
export function Schedules({ today }: { today: string }) {
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(defaultEnd(today));
  const [weekdayHours, setWeekdayHours] = useState(defaultHours.weekday);
  const [restDayHours, setRestDayHours] = useState(defaultHours.restDay);
  // A book is optional, and without a chapter picked its range runs to that end of the book.
  const [textbookId, setTextbookId] = useState('');
  const [fromContentId, setFromContentId] = useState('');
  const [toContentId, setToContentId] = useState('');
  const [textbooks, setTextbooks] = useState<Textbook[]>();
  const [textbooksFailed, setTextbooksFailed] = useState(false);
  // Tagged with their book, so a slow answer for another one is never offered for this one.
  const [chapters, setChapters] = useState<{ textbookId: string; list: ContentNode[] }>();
  const [chaptersFailed, setChaptersFailed] = useState<string>();

  const [schedules, setSchedules] = useState<Schedule[]>();
  const [listError, setListError] = useState<string>();
  const [reload, setReload] = useState(0);
  const [pickedId, setPickedId] = useState<number>();
  // Tagged with their schedule, so a slow answer for another one is never shown as this one's.
  const [detail, setDetail] = useState<ScheduleDetail>();
  const [detailError, setDetailError] = useState<{ id: number; message: string }>();
  const [confirming, setConfirming] = useState<number>();
  // Each next to the buttons that lead to it: the list can be scrolled far below the form.
  const [notice, setNotice] = useState<Notice>(undefined);
  const [listNotice, setListNotice] = useState<Notice>(undefined);
  const { busy, action, nameNext, begin, end } = useBusy();
  const [wantFocus, setWantFocus] = useState<string>();
  useEffect(() => {
    if (!wantFocus || busy) return;
    setWantFocus(undefined);
    document.getElementById(wantFocus)?.focus?.();
  }, [wantFocus, busy]);

  useEffect(() => {
    let current = true;
    requestJson<{ schedules: Schedule[] }>('/api/schedules')
      .then((data) => {
        if (!current) return;
        setSchedules(data.schedules);
        setListError(undefined);
      })
      .catch((failure: RequestError) => current && setListError(failure.message));
    return () => {
      current = false;
    };
  }, [reload]);

  useEffect(() => {
    let current = true;
    requestJson<{ textbooks: Textbook[] }>('/api/textbooks')
      .then((data) => current && setTextbooks(data.textbooks))
      .catch(() => current && setTextbooksFailed(true));
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    if (!textbookId) return;
    let current = true;
    requestJson<{ contents: ContentNode[] }>(`/api/textbooks/${textbookId}/contents`)
      .then((data) => current && setChapters({ textbookId, list: data.contents }))
      .catch(() => current && setChaptersFailed(textbookId));
    return () => {
      current = false;
    };
  }, [textbookId]);

  const bookChapters = chapters?.textbookId === textbookId ? chapters.list : undefined;

  // The one picked, or the first in the list (the latest start); a picked one that is gone falls
  // back too.
  const shown = schedules?.find((item) => item.id === pickedId) ?? schedules?.[0];
  const shownId = shown?.id;

  useEffect(() => {
    if (shownId === undefined) return;
    let current = true;
    requestJson<ScheduleDetail>(`/api/schedules/${shownId}`)
      .then((data) => {
        if (!current) return;
        setDetail(data);
        setDetailError(undefined);
      })
      .catch(
        (failure: RequestError) =>
          current && setDetailError({ id: shownId, message: failure.message }),
      );
    return () => {
      current = false;
    };
  }, [shownId, reload]);

  const shownDetail = detail?.schedule.id === shownId ? detail : undefined;
  const shownError = detailError && detailError.id === shownId ? detailError.message : undefined;

  const create = async (event: { preventDefault(): void }) => {
    event.preventDefault();
    const weekdayMinutes = hoursToMinutes(weekdayHours);
    const restDayMinutes = hoursToMinutes(restDayHours);
    if (weekdayMinutes === undefined || restDayMinutes === undefined) {
      setNotice({ kind: 'alert', text: '하루 분량은 0시간에서 24시간 사이로 입력하세요' });
      return;
    }
    // Without its chapters read there was no chance to pick a range, and a whole book cannot be
    // narrowed afterwards (docs/decisions/schedule-rules.md 5장).
    if (textbookId && !bookChapters) {
      setNotice({
        kind: 'alert',
        text: '교재의 목차를 아직 읽지 못했습니다. 잠시 뒤 다시 시도하거나 교재를 다시 고르세요',
      });
      return;
    }
    nameNext('create');
    if (!begin()) return;
    setNotice(undefined);
    setListNotice(undefined);
    setConfirming(undefined);
    try {
      const data = await requestJson<ScheduleDetail>('/api/schedules', {
        method: 'POST',
        body: {
          title,
          startDate,
          endDate,
          weekdayMinutes,
          restDayMinutes,
          ...(textbookId && {
            chapters: {
              textbookId: Number(textbookId),
              fromContentId: fromContentId ? Number(fromContentId) : null,
              toContentId: toContentId ? Number(toContentId) : null,
            },
          }),
        },
      });
      setDetail(data);
      setPickedId(data.schedule.id);
      setSchedules((all) => [data.schedule, ...(all ?? [])]);
      setTitle('');
      setNotice({ kind: 'status', text: '일정을 만들었습니다' });
      setWantFocus('schedule-heading');
      setReload((count) => count + 1);
    } catch (failure) {
      setNotice({ kind: 'alert', text: (failure as RequestError).message });
    } finally {
      end();
    }
  };

  const remove = async (id: number) => {
    nameNext('delete');
    if (!begin()) return;
    setNotice(undefined);
    setListNotice(undefined);
    try {
      await requestJson(`/api/schedules/${id}`, { method: 'DELETE' });
      // At once, and even if reading the list again fails.
      setSchedules((all) => all?.filter((item) => item.id !== id));
      setListNotice({ kind: 'status', text: '일정을 삭제했습니다' });
      setWantFocus('schedules-heading');
    } catch (failure) {
      const { status, message } = failure as RequestError;
      setListNotice({ kind: 'alert', text: message });
      // Already gone elsewhere, so the button it would go back to goes with the reload.
      setWantFocus(status === 404 ? 'schedules-heading' : `schedule-delete-${id}`);
    } finally {
      setConfirming(undefined);
      setReload((count) => count + 1);
      end();
    }
  };

  // Typing takes back what was said about the last try.
  const typed = (set: (value: string) => void) => (event: { target: { value: string } }) => {
    setNotice(undefined);
    set(event.target.value);
  };

  return (
    <div className="schedules">
      <section className="card" aria-label="일정 만들기">
        <h2>일정 만들기</h2>
        <form className="log-form" onSubmit={(event) => void create(event)}>
          <label className="wide">
            일정 이름
            <input
              required
              maxLength={200}
              placeholder="예: 알고리즘 교재 1회독"
              disabled={busy}
              value={title}
              onChange={typed(setTitle)}
            />
          </label>
          <label>
            시작일
            <input
              type="date"
              required
              min={today}
              disabled={busy}
              value={startDate}
              onChange={typed(setStartDate)}
            />
          </label>
          <label>
            종료일
            <input
              type="date"
              required
              min={startDate}
              disabled={busy}
              value={endDate}
              onChange={typed(setEndDate)}
            />
          </label>
          <label>
            평일 (시간)
            <input
              type="number"
              required
              min={0}
              max={24}
              step={0.5}
              disabled={busy}
              value={weekdayHours}
              onChange={typed(setWeekdayHours)}
            />
          </label>
          <label>
            주말·공휴일 (시간)
            <input
              type="number"
              required
              min={0}
              max={24}
              step={0.5}
              disabled={busy}
              value={restDayHours}
              onChange={typed(setRestDayHours)}
            />
          </label>
          <label className="half">
            교재 (선택)
            <select
              disabled={busy || !textbooks}
              value={textbookId}
              onChange={(event) => {
                setNotice(undefined);
                setTextbookId(event.target.value);
                setFromContentId('');
                setToContentId('');
                // Even for the same book again: what was read before does not count as read now.
                setChapters(undefined);
                setChaptersFailed(undefined);
              }}
            >
              <option value="">교재 없이 시간만</option>
              {textbooks?.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.title}
                </option>
              ))}
            </select>
          </label>
          {textbookId && (
            <>
              <label>
                첫 장
                <select
                  disabled={busy || !bookChapters?.length}
                  value={fromContentId}
                  onChange={typed(setFromContentId)}
                >
                  <option value="">처음부터</option>
                  {bookChapters?.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>
                      {contentLabel(chapter)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                마지막 장
                <select
                  disabled={busy || !bookChapters?.length}
                  value={toContentId}
                  onChange={typed(setToContentId)}
                >
                  <option value="">끝까지</option>
                  {bookChapters?.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>
                      {contentLabel(chapter)}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {textbooksFailed && <p className="status wide">교재 목록을 불러오지 못했습니다</p>}
          {chaptersFailed === textbookId && textbookId && (
            <p className="status wide">이 교재의 목차를 불러오지 못했습니다</p>
          )}
          {bookChapters?.length === 0 && (
            <p className="status wide">이 교재에는 장이 없습니다. 목차를 먼저 등록하세요</p>
          )}
          <div className="actions wide">
            <button type="submit" className="primary" disabled={busy}>
              <ButtonSpinner when={action === 'create'} />
              일정 만들기
            </button>
          </div>
        </form>
        {/* Always mounted so screen readers announce each new message. */}
        <p role="status" className="status">
          {notice?.kind === 'status' ? notice.text : ''}
        </p>
        {notice?.kind === 'alert' && (
          <p role="alert" className="error">
            {notice.text}
          </p>
        )}
      </section>

      <section className="card" aria-label="내 일정">
        <h2 id="schedules-heading" tabIndex={-1}>
          내 일정
        </h2>
        {/* Above the rows: a long list would put it out of sight. */}
        <p role="status" className="status">
          {listNotice?.kind === 'status' ? listNotice.text : ''}
        </p>
        {listNotice?.kind === 'alert' && (
          <p role="alert" className="error">
            {listNotice.text}
          </p>
        )}
        {listError && (
          <p role="alert" className="error">
            일정을 불러오지 못했습니다: {listError}
          </p>
        )}
        {schedules === undefined ? (
          !listError && <Loading label="일정을 불러오는 중" />
        ) : schedules.length === 0 ? (
          <p className="status">아직 만든 일정이 없습니다</p>
        ) : (
          <ul className="log-list">
            {schedules.map((item) => (
              <li key={item.id}>
                <div className="log-head">
                  <button
                    type="button"
                    className="book-title"
                    disabled={busy}
                    aria-current={item.id === shownId ? 'true' : undefined}
                    onClick={() => {
                      setPickedId(item.id);
                      setConfirming(undefined);
                      setNotice(undefined);
                      setListNotice(undefined);
                      // Also the way to try again after its days could not be read: the
                      // error leaves first, so a second failure is shown and announced anew.
                      setDetailError(undefined);
                      setReload((count) => count + 1);
                    }}
                  >
                    {item.title}
                  </button>
                  <div className="actions">
                    {confirming === item.id ? (
                      <>
                        <button
                          type="button"
                          id={`schedule-delete-confirm-${item.id}`}
                          className="danger"
                          aria-label={`${item.title} 삭제 확인`}
                          disabled={busy}
                          onClick={() => void remove(item.id)}
                        >
                          <ButtonSpinner when={action === 'delete'} />
                          삭제 확인
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          aria-label={`${item.title} 삭제 취소`}
                          disabled={busy}
                          onClick={() => {
                            setConfirming(undefined);
                            setWantFocus(`schedule-delete-${item.id}`);
                          }}
                        >
                          취소
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        id={`schedule-delete-${item.id}`}
                        className="secondary"
                        aria-label={`${item.title} 삭제`}
                        disabled={busy}
                        onClick={() => {
                          setConfirming(item.id);
                          setWantFocus(`schedule-delete-confirm-${item.id}`);
                        }}
                      >
                        삭제
                      </button>
                    )}
                  </div>
                </div>
                <p className="status">
                  {item.textbookTitle && `${item.textbookTitle} · `}
                  {item.startDate} ~ {item.endDate} · 목표 {formatMinutes(item.totalMinutes)} ·{' '}
                  {item.itemCount}일
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {shown && (
        <section className="card" aria-label="날짜별 일정">
          {/* Days already read stay if reading them again fails: they do not change once made. */}
          {shownDetail ? (
            <>
              <h2 id="schedule-heading" tabIndex={-1}>
                {shownDetail.schedule.title}
              </h2>
              {shownDetail.schedule.textbookTitle && (
                <p className="status schedule-book">{shownDetail.schedule.textbookTitle}</p>
              )}
              <dl className="retro-summary" aria-label="일정 요약">
                <div>
                  <dt>평일</dt>
                  <dd>{formatMinutes(shownDetail.schedule.weekdayMinutes)}</dd>
                </div>
                <div>
                  <dt>주말·공휴일</dt>
                  <dd>{formatMinutes(shownDetail.schedule.restDayMinutes)}</dd>
                </div>
                <div>
                  <dt>전체 목표</dt>
                  <dd>{formatMinutes(shownDetail.schedule.totalMinutes)}</dd>
                </div>
                <div>
                  <dt>학습일</dt>
                  <dd>{shownDetail.schedule.itemCount}일</dd>
                </div>
              </dl>
              <ul className="schedule-days" aria-label="날짜별 목표 시간">
                {shownDetail.items.map((item) => (
                  <li key={item.id} aria-current={item.date === today ? 'date' : undefined}>
                    <span className="schedule-day">
                      <span>{dayLabel(item.date, shownDetail.schedule.startDate)}</span>
                      {item.contents.length > 0 && (
                        <span className="status">
                          {item.contents.map(contentLabel).join(' · ')}
                        </span>
                      )}
                    </span>
                    <strong>{formatMinutes(item.targetMinutes)}</strong>
                  </li>
                ))}
              </ul>
            </>
          ) : shownError ? (
            <p role="alert" className="error">
              날짜별 일정을 불러오지 못했습니다: {shownError}
            </p>
          ) : (
            <Loading label="날짜별 일정을 불러오는 중" />
          )}
        </section>
      )}
    </div>
  );
}
