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
// (docs/decisions/schedule-rules.md section 6), so this offers deleting rather than editing them.
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
      setNotice({ kind: 'alert', text: 'Enter a daily amount between 0 and 24 hours' });
      return;
    }
    // Without its chapters read there was no chance to pick a range, and a whole book cannot be
    // narrowed afterwards (docs/decisions/schedule-rules.md section 6).
    if (textbookId && !bookChapters) {
      setNotice({
        kind: 'alert',
        text: 'The textbook contents have not been loaded yet. Try again in a moment or choose the textbook again',
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
      setNotice({ kind: 'status', text: 'Schedule created' });
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
      done ? 'Completion undone' : 'Marked as done',
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
      target.withLater ? 'Moved along with the later days' : 'Moved the day',
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
      setListNotice({ kind: 'status', text: 'Schedule deleted' });
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

  // Only the name changes after creating (docs/decisions/schedule-rules.md section 6, #179). The same
  // checks as the server's, which also trims, so a long name is said rather than cut.
  const rename = async (target: Renaming) => {
    const refuse = (error: string) => {
      setRenaming({ ...target, error });
      setWantFocus('schedule-rename-input');
    };
    const trimmed = target.title.trim();
    if (!trimmed) return refuse('Enter the schedule name');
    if (trimmed.length > 200) return refuse('The schedule name must be at most 200 characters');
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
      setDayNotice({ kind: 'status', text: 'Schedule renamed' });
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
      <section className="card" aria-label="Create a schedule">
        <h2>Create a schedule</h2>
        <form className="log-form" onSubmit={(event) => void create(event)}>
          <label className="wide">
            Schedule name
            <input
              required
              maxLength={200}
              placeholder="e.g. Algorithms textbook, first pass"
              disabled={busy}
              value={title}
              onChange={typed(setTitle)}
            />
          </label>
          <label>
            Start date
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
            End date
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
            Weekdays (hours)
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
            Weekends and holidays (hours)
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
            Textbook (optional)
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
              <option value="">Time only, no textbook</option>
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
                First chapter
                <select
                  disabled={busy || !bookChapters?.length}
                  value={fromContentId}
                  onChange={typed(setFromContentId)}
                >
                  <option value="">From the start</option>
                  {bookChapters?.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>
                      {contentLabel(chapter)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Last chapter
                <select
                  disabled={busy || !bookChapters?.length}
                  value={toContentId}
                  onChange={typed(setToContentId)}
                >
                  <option value="">To the end</option>
                  {bookChapters?.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>
                      {contentLabel(chapter)}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {textbooksFailed && <p className="status wide">Could not load the textbooks</p>}
          {chaptersFailed === textbookId && textbookId && (
            <p className="status wide">Could not load the contents of this textbook</p>
          )}
          {bookChapters?.length === 0 && (
            <p className="status wide">This textbook has no chapters. Add its contents first</p>
          )}
          <div className="actions wide">
            <button type="submit" className="primary" disabled={busy}>
              <ButtonSpinner when={action === 'create'} />
              Create a schedule
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

      <section className="card" aria-label="My schedules">
        <h2 id="schedules-heading" tabIndex={-1}>
          My schedules
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
            Could not load the schedules: {listError}
          </p>
        )}
        {schedules === undefined ? (
          !listError && <Loading label="Loading the schedules" />
        ) : schedules.length === 0 ? (
          <p className="status">No schedules yet</p>
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
                          aria-label={`${item.title} confirm deletion`}
                          disabled={busy}
                          onClick={() => void remove(item.id)}
                        >
                          <ButtonSpinner when={action === 'delete'} />
                          Confirm delete
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          aria-label={`${item.title} cancel deletion`}
                          disabled={busy}
                          onClick={() => {
                            setConfirming(undefined);
                            setWantFocus(`schedule-delete-${item.id}`);
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        id={`schedule-delete-${item.id}`}
                        className="secondary"
                        aria-label={`${item.title} delete`}
                        disabled={busy}
                        onClick={() => {
                          setConfirming(item.id);
                          setWantFocus(`schedule-delete-confirm-${item.id}`);
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
                <p className="status">
                  {item.textbookTitle && `${item.textbookTitle} · `}
                  {item.startDate} ~ {item.endDate}
                  {item.delayDays > 0 && ` (${item.delayDays} days late)`} · progress{' '}
                  {item.progressPercent}% · goal {formatMinutes(item.totalMinutes)} ·{' '}
                  {item.itemCount} days
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {shown && (
        <section className="card" aria-label="Schedule by date">
          {/* Days already read stay if reading them again fails. */}
          {shownDetail ? (
            <>
              {renaming?.id === shownDetail.schedule.id ? (
                <form
                  className="schedule-rename"
                  aria-label="Edit schedule name"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void rename(renaming);
                  }}
                >
                  <label>
                    New schedule name
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
                      Save name
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      aria-label="Cancel renaming"
                      disabled={busy}
                      onClick={() => {
                        setDayNotice(undefined);
                        setRenaming(undefined);
                        setWantFocus('schedule-rename');
                      }}
                    >
                      Cancel
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
                    aria-label={`${shownDetail.schedule.title} rename`}
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
                    Rename
                  </button>
                </div>
              )}
              {shownDetail.schedule.textbookTitle && (
                <p className="status schedule-book">{shownDetail.schedule.textbookTitle}</p>
              )}
              <div className="schedule-progress">
                <p>
                  Progress <strong>{shownDetail.schedule.progressPercent}%</strong>
                  <span className="status">
                    {formatMinutes(shownDetail.schedule.completedMinutes)} /{' '}
                    {formatMinutes(shownDetail.schedule.totalMinutes)} ·{' '}
                    {shownDetail.schedule.completedCount} / {shownDetail.schedule.itemCount} days
                  </span>
                </p>
                <div
                  role="progressbar"
                  aria-label="Schedule progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={shownDetail.schedule.progressPercent}
                >
                  <div style={{ width: `${shownDetail.schedule.progressPercent}%` }} />
                </div>
              </div>
              <dl className="retro-summary" aria-label="Schedule summary">
                <div>
                  <dt>Weekdays</dt>
                  <dd>{formatMinutes(shownDetail.schedule.weekdayMinutes)}</dd>
                </div>
                <div>
                  <dt>Weekends and holidays</dt>
                  <dd>{formatMinutes(shownDetail.schedule.restDayMinutes)}</dd>
                </div>
                <div>
                  <dt>Total goal</dt>
                  <dd>{formatMinutes(shownDetail.schedule.totalMinutes)}</dd>
                </div>
                <div>
                  <dt>Study days</dt>
                  <dd>{shownDetail.schedule.itemCount}</dd>
                </div>
              </dl>
              {shownDetail.schedule.delayDays > 0 && (
                <p className="status">
                  Ends on {shownDetail.schedule.currentEndDate}, {shownDetail.schedule.delayDays}{' '}
                  days after the originally planned end date {shownDetail.schedule.endDate}
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
              <ul className="schedule-days" aria-label="Target time by date">
                {shownDetail.items.map((item) => (
                  <li
                    key={item.id}
                    aria-current={item.date === today ? 'date' : undefined}
                    className={item.completedOn ? 'done' : undefined}
                  >
                    <input
                      type="checkbox"
                      id={`schedule-day-check-${item.id}`}
                      aria-label={`${names.get(item.id)} complete`}
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
                        aria-label={`${names.get(item.id)} move`}
                        disabled={busy}
                        onClick={() => {
                          setDayNotice(undefined);
                          setMoving({ id: item.id, date: item.date, withLater: false });
                          setWantFocus(`schedule-day-date-${item.id}`);
                        }}
                      >
                        Move
                      </button>
                    )}
                    {moving?.id === item.id && !item.completedOn && (
                      <form
                        className="schedule-move"
                        aria-label={`${names.get(item.id)} move`}
                        onSubmit={(event) => {
                          event.preventDefault();
                          void moveDay(shownDetail.schedule.id, moving);
                        }}
                      >
                        <label>
                          Move to
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
                          Move later days too
                        </label>
                        <div className="actions">
                          <button type="submit" className="primary" disabled={busy}>
                            <ButtonSpinner when={action === 'move'} />
                            Move
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
                            Cancel
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
              Could not load the schedule days: {shownError}
            </p>
          ) : (
            <Loading label="Loading the schedule days" />
          )}
        </section>
      )}
    </div>
  );
}
