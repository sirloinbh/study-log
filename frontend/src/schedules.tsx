import { useEffect, useState } from 'react';

import { type RequestError, requestJson } from './api';
import { useBusy } from './busy';
import { ButtonSpinner, Loading } from './loading';
import {
  dayLabel,
  dayNames,
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
// (docs/decisions/schedule-rules.md 6장), so this offers deleting rather than editing them.
type Renaming = { id: number; title: string; error?: string };

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
  // The day being moved, and where to.
  const [moving, setMoving] = useState<{ id: number; date: string; withLater: boolean }>();
  // The schedule whose name is being changed, the name typed and why it was refused (#179).
  const [renaming, setRenaming] = useState<Renaming>();
  const [dayNotice, setDayNotice] = useState<Notice>(undefined);
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
    // narrowed afterwards (docs/decisions/schedule-rules.md 6장).
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
    setDayNotice(undefined);
    setMoving(undefined);
    setRenaming(undefined);
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

  // A change to one day answers with the whole schedule: others can move with it.
  const changeDay = async (
    name: string,
    dayId: number,
    request: () => Promise<ScheduleDetail>,
    success: string,
    focus: string,
    focusIfRefused: string = focus,
  ) => {
    nameNext(name);
    if (!begin()) return;
    setNotice(undefined);
    setListNotice(undefined);
    setDayNotice(undefined);
    try {
      setDetail(await request());
      if (name === 'move') setMoving(undefined);
      setDayNotice({ kind: 'status', text: success });
      setWantFocus(focus);
    } catch (failure) {
      const { status, message } = failure as RequestError;
      if (status === 404) {
        // The schedule is gone, and its card with the reload: this goes where it stays.
        setMoving(undefined);
        setListNotice({ kind: 'alert', text: message });
        setWantFocus('schedules-heading');
      } else if (status === 409) {
        // Done or reopened elsewhere: the reload may take the form and its button away.
        setMoving(undefined);
        setDayNotice({ kind: 'alert', text: message });
        setWantFocus(`schedule-day-check-${dayId}`);
      } else {
        setDayNotice({ kind: 'alert', text: message });
        setWantFocus(focusIfRefused);
      }
    } finally {
      // The list's end date follows, and after a refusal the days are read again.
      setReload((count) => count + 1);
      end();
    }
  };

  const toggleDay = (scheduleId: number, id: number, done: boolean) =>
    changeDay(
      'toggle',
      id,
      () =>
        requestJson<ScheduleDetail>(
          `/api/schedules/${scheduleId}/items/${id}/${done ? 'reopen' : 'complete'}`,
          { method: 'POST' },
        ),
      done ? '완료를 취소했습니다' : '완료로 표시했습니다',
      `schedule-day-check-${id}`,
    );

  const moveDay = (scheduleId: number, target: { id: number; date: string; withLater: boolean }) =>
    changeDay(
      'move',
      target.id,
      () =>
        requestJson<ScheduleDetail>(`/api/schedules/${scheduleId}/items/${target.id}/date`, {
          method: 'PUT',
          body: { date: target.date, withLater: target.withLater },
        }),
      target.withLater ? '이후 일정과 함께 옮겼습니다' : '날짜를 옮겼습니다',
      `schedule-day-move-${target.id}`,
      `schedule-day-date-${target.id}`,
    );

  const remove = async (id: number) => {
    nameNext('delete');
    if (!begin()) return;
    setNotice(undefined);
    setListNotice(undefined);
    setDayNotice(undefined);
    setMoving(undefined);
    setRenaming(undefined);
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

  // Only the name changes after creating (docs/decisions/schedule-rules.md 6장, #179). The same
  // checks as the server's, which also trims, so a long name is said rather than cut.
  const rename = async (target: Renaming) => {
    const refuse = (error: string) => {
      setRenaming({ ...target, error });
      setWantFocus('schedule-rename-input');
    };
    const trimmed = target.title.trim();
    if (!trimmed) return refuse('일정 이름을 입력하세요');
    if (trimmed.length > 200) return refuse('일정 이름 길이는 200자 이하여야 합니다');
    nameNext('rename');
    if (!begin()) return;
    setNotice(undefined);
    setListNotice(undefined);
    setDayNotice(undefined);
    setRenaming({ ...target, error: undefined });
    try {
      const data = await requestJson<ScheduleDetail>(`/api/schedules/${target.id}`, {
        method: 'PUT',
        body: { title: target.title },
      });
      setDetail(data);
      // At once, and even if reading the list again fails.
      setSchedules((all) =>
        all?.map((item) =>
          item.id === target.id ? { ...item, title: data.schedule.title } : item,
        ),
      );
      setRenaming(undefined);
      setDayNotice({ kind: 'status', text: '일정 이름을 바꿨습니다' });
      setWantFocus('schedule-heading');
    } catch (failure) {
      const { status, message } = failure as RequestError;
      if (status === 404) {
        // Deleted elsewhere: its card goes with the reload.
        setRenaming(undefined);
        setListNotice({ kind: 'alert', text: message });
        setWantFocus('schedules-heading');
      } else refuse(message);
    } finally {
      setReload((count) => count + 1);
      end();
    }
  };

  const names = dayNames(shownDetail?.items ?? [], shownDetail?.schedule.startDate ?? '');

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
                      setDayNotice(undefined);
                      setMoving(undefined);
                      setRenaming(undefined);
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
                  {item.startDate} ~ {item.endDate}
                  {item.delayDays > 0 && ` (${item.delayDays}일 늦어짐)`} · 진행{' '}
                  {item.progressPercent}% · 목표 {formatMinutes(item.totalMinutes)} ·{' '}
                  {item.itemCount}일
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {shown && (
        <section className="card" aria-label="날짜별 일정">
          {/* Days already read stay if reading them again fails. */}
          {shownDetail ? (
            <>
              {renaming?.id === shownDetail.schedule.id ? (
                <form
                  className="schedule-rename"
                  aria-label="일정 이름 수정"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void rename(renaming);
                  }}
                >
                  <label>
                    새 일정 이름
                    <input
                      id="schedule-rename-input"
                      required
                      disabled={busy}
                      value={renaming.title}
                      aria-invalid={renaming.error ? 'true' : undefined}
                      aria-describedby={renaming.error ? 'schedule-rename-error' : undefined}
                      onChange={(event) => {
                        setDayNotice(undefined);
                        setRenaming({ ...renaming, title: event.target.value, error: undefined });
                      }}
                    />
                  </label>
                  <div className="actions">
                    <button type="submit" className="primary" disabled={busy}>
                      <ButtonSpinner when={action === 'rename'} />
                      이름 저장
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      aria-label="이름 수정 취소"
                      disabled={busy}
                      onClick={() => {
                        setDayNotice(undefined);
                        setRenaming(undefined);
                        setWantFocus('schedule-rename');
                      }}
                    >
                      취소
                    </button>
                  </div>
                  {/* Right under the name, apart from what the days say. */}
                  {renaming.error && (
                    <p id="schedule-rename-error" role="alert" className="error">
                      {renaming.error}
                    </p>
                  )}
                </form>
              ) : (
                <div className="log-head">
                  <h2 id="schedule-heading" tabIndex={-1}>
                    {shownDetail.schedule.title}
                  </h2>
                  <button
                    type="button"
                    id="schedule-rename"
                    className="secondary"
                    aria-label={`${shownDetail.schedule.title} 이름 수정`}
                    disabled={busy}
                    onClick={() => {
                      setDayNotice(undefined);
                      setRenaming({
                        id: shownDetail.schedule.id,
                        title: shownDetail.schedule.title,
                      });
                      setWantFocus('schedule-rename-input');
                    }}
                  >
                    이름 수정
                  </button>
                </div>
              )}
              {shownDetail.schedule.textbookTitle && (
                <p className="status schedule-book">{shownDetail.schedule.textbookTitle}</p>
              )}
              <div className="schedule-progress">
                <p>
                  진행률 <strong>{shownDetail.schedule.progressPercent}%</strong>
                  <span className="status">
                    {formatMinutes(shownDetail.schedule.completedMinutes)} /{' '}
                    {formatMinutes(shownDetail.schedule.totalMinutes)} ·{' '}
                    {shownDetail.schedule.completedCount} / {shownDetail.schedule.itemCount}일
                  </span>
                </p>
                <div
                  role="progressbar"
                  aria-label="일정 진행률"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={shownDetail.schedule.progressPercent}
                >
                  <div style={{ width: `${shownDetail.schedule.progressPercent}%` }} />
                </div>
              </div>
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
              {shownDetail.schedule.delayDays > 0 && (
                <p className="status">
                  처음 정한 종료일 {shownDetail.schedule.endDate}에서{' '}
                  {shownDetail.schedule.delayDays}일 늦어져 {shownDetail.schedule.currentEndDate}에
                  끝납니다
                </p>
              )}
              <p role="status" className="status">
                {dayNotice?.kind === 'status' ? dayNotice.text : ''}
              </p>
              {dayNotice?.kind === 'alert' && (
                <p role="alert" className="error">
                  {dayNotice.text}
                </p>
              )}
              <ul className="schedule-days" aria-label="날짜별 목표 시간">
                {shownDetail.items.map((item) => (
                  <li
                    key={item.id}
                    aria-current={item.date === today ? 'date' : undefined}
                    className={item.completedOn ? 'done' : undefined}
                  >
                    <input
                      type="checkbox"
                      id={`schedule-day-check-${item.id}`}
                      aria-label={`${names.get(item.id)} 완료`}
                      checked={item.completedOn !== null}
                      disabled={busy}
                      onChange={() =>
                        void toggleDay(shownDetail.schedule.id, item.id, item.completedOn !== null)
                      }
                    />
                    <span className="schedule-day">
                      <span>{dayLabel(item.date, shownDetail.schedule.startDate)}</span>
                      {item.contents.length > 0 && (
                        <span className="status">
                          {item.contents.map(contentLabel).join(' · ')}
                        </span>
                      )}
                    </span>
                    <strong>{formatMinutes(item.targetMinutes)}</strong>
                    {!item.completedOn && moving?.id !== item.id && (
                      <button
                        type="button"
                        id={`schedule-day-move-${item.id}`}
                        className="secondary"
                        aria-label={`${names.get(item.id)} 옮기기`}
                        disabled={busy}
                        onClick={() => {
                          setDayNotice(undefined);
                          setMoving({ id: item.id, date: item.date, withLater: false });
                          setWantFocus(`schedule-day-date-${item.id}`);
                        }}
                      >
                        옮기기
                      </button>
                    )}
                    {moving?.id === item.id && !item.completedOn && (
                      <form
                        className="schedule-move"
                        aria-label={`${names.get(item.id)} 옮기기`}
                        onSubmit={(event) => {
                          event.preventDefault();
                          void moveDay(shownDetail.schedule.id, moving);
                        }}
                      >
                        <label>
                          옮길 날짜
                          <input
                            type="date"
                            id={`schedule-day-date-${item.id}`}
                            required
                            min={today}
                            disabled={busy}
                            value={moving.date}
                            onChange={(event) => {
                              setDayNotice(undefined);
                              setMoving({ ...moving, date: event.target.value });
                            }}
                          />
                        </label>
                        <label className="schedule-later">
                          <input
                            type="checkbox"
                            disabled={busy}
                            checked={moving.withLater}
                            onChange={(event) => {
                              setDayNotice(undefined);
                              setMoving({ ...moving, withLater: event.target.checked });
                            }}
                          />
                          이후 일정도 함께
                        </label>
                        <div className="actions">
                          <button type="submit" className="primary" disabled={busy}>
                            <ButtonSpinner when={action === 'move'} />
                            옮기기
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            disabled={busy}
                            onClick={() => {
                              setDayNotice(undefined);
                              setMoving(undefined);
                              setWantFocus(`schedule-day-move-${item.id}`);
                            }}
                          >
                            취소
                          </button>
                        </div>
                      </form>
                    )}
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
