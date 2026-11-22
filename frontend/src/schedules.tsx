import { useEffect, useState } from 'react';

import { useBusy } from './busy';
import { type RequestError, requestJson } from './lib/api';
import { Loading } from './loading';
import { dayNames, type Schedule, type ScheduleDetail } from './schedule';
import { type NewSchedule, type Notice, ScheduleCreateForm } from './schedule-create-form';
import { type Moving, ScheduleDays } from './schedule-days';
import { type Renaming, ScheduleDetailView } from './schedule-detail';
import { ScheduleList } from './schedule-list';

// Study schedules (#35): a form that makes one from a period and daily hours, the schedules there
// are, and the days of the one picked. A schedule's period and hours do not change once it is made
// (docs/decisions/schedule-rules.md section 6), so this offers deleting rather than editing them.
// This file holds the state and the requests; what is on screen is in the schedule-*.tsx files.
export function Schedules({ today }: { today: string }) {
  const [schedules, setSchedules] = useState<Schedule[]>();
  const [listError, setListError] = useState<string>();
  const [reload, setReload] = useState(0);
  const [pickedId, setPickedId] = useState<number>();
  // Tagged with their schedule, so a slow answer for another one is never shown as this one's.
  const [detail, setDetail] = useState<ScheduleDetail>();
  const [detailError, setDetailError] = useState<{ id: number; message: string }>();
  const [confirming, setConfirming] = useState<number>();
  const [moving, setMoving] = useState<Moving>();
  const [renaming, setRenaming] = useState<Renaming>();
  // Each next to the buttons that lead to it: the list can be scrolled far below the form.
  const [dayNotice, setDayNotice] = useState<Notice>(undefined);
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

  // A new action takes back what was said about the last one, beside all three buttons.
  const clearNotices = () => {
    setNotice(undefined);
    setListNotice(undefined);
    setDayNotice(undefined);
  };

  const create = async (schedule: NewSchedule) => {
    nameNext('create');
    if (!begin()) return false;
    clearNotices();
    setMoving(undefined);
    setRenaming(undefined);
    setConfirming(undefined);
    try {
      const data = await requestJson<ScheduleDetail>('/api/schedules', {
        method: 'POST',
        body: schedule,
      });
      setDetail(data);
      setPickedId(data.schedule.id);
      setSchedules((all) => [data.schedule, ...(all ?? [])]);
      setNotice({ kind: 'status', text: 'Schedule created' });
      setWantFocus('schedule-heading');
      setReload((count) => count + 1);
      return true;
    } catch (failure) {
      setNotice({ kind: 'alert', text: (failure as RequestError).message });
      return false;
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
    clearNotices();
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

  const moveDay = (scheduleId: number, target: Moving) =>
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
    clearNotices();
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
    clearNotices();
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

  const pick = (id: number) => {
    setPickedId(id);
    setConfirming(undefined);
    clearNotices();
    setMoving(undefined);
    setRenaming(undefined);
    // Also the way to try again after its days could not be read: the error leaves first, so a
    // second failure is shown and announced anew.
    setDetailError(undefined);
    setReload((count) => count + 1);
  };

  const names = dayNames(shownDetail?.items ?? [], shownDetail?.schedule.startDate ?? '');

  return (
    <div className="schedules">
      <ScheduleCreateForm
        today={today}
        busy={busy}
        action={action}
        notice={notice}
        setNotice={setNotice}
        onCreate={create}
      />

      <ScheduleList
        schedules={schedules}
        listError={listError}
        listNotice={listNotice}
        shownId={shownId}
        confirming={confirming}
        busy={busy}
        action={action}
        onPick={pick}
        onAskDelete={(id) => {
          setConfirming(id);
          setWantFocus(`schedule-delete-confirm-${id}`);
        }}
        onCancelDelete={(id) => {
          setConfirming(undefined);
          setWantFocus(`schedule-delete-${id}`);
        }}
        onDelete={(id) => void remove(id)}
      />

      {shown && (
        <section className="card" aria-label="Schedule by date">
          {/* Days already read stay if reading them again fails. */}
          {shownDetail ? (
            <ScheduleDetailView
              detail={shownDetail}
              renaming={renaming}
              dayNotice={dayNotice}
              busy={busy}
              action={action}
              onStartRename={() => {
                setDayNotice(undefined);
                setRenaming({ id: shownDetail.schedule.id, title: shownDetail.schedule.title });
                setWantFocus('schedule-rename-input');
              }}
              onChangeRename={(next) => {
                setDayNotice(undefined);
                setRenaming(next);
              }}
              onCancelRename={() => {
                setDayNotice(undefined);
                setRenaming(undefined);
                setWantFocus('schedule-rename');
              }}
              onRename={(target) => void rename(target)}
            >
              <ScheduleDays
                detail={shownDetail}
                names={names}
                today={today}
                moving={moving}
                busy={busy}
                action={action}
                onToggle={(id, done) => void toggleDay(shownDetail.schedule.id, id, done)}
                onStartMove={(target) => {
                  setDayNotice(undefined);
                  setMoving(target);
                  setWantFocus(`schedule-day-date-${target.id}`);
                }}
                onChangeMove={(target) => {
                  setDayNotice(undefined);
                  setMoving(target);
                }}
                onCancelMove={(id) => {
                  setDayNotice(undefined);
                  setMoving(undefined);
                  setWantFocus(`schedule-day-move-${id}`);
                }}
                onMove={(target) => void moveDay(shownDetail.schedule.id, target)}
              />
            </ScheduleDetailView>
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
