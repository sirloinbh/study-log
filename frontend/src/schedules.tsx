import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { useBusy } from './busy';
import type { RequestError } from './lib/api';
import { apiKey, type ApiRequest, useApiMutation, useApiQuery } from './lib/query';
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
const listKey = apiKey('/api/schedules');

export function Schedules({ today }: { today: string }) {
  const client = useQueryClient();
  const [pickedId, setPickedId] = useState<number>();
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

  // Always stale, so picking or changing something reads the list and the days again as before.
  const listQuery = useApiQuery<{ schedules: Schedule[] }>(listKey, '/api/schedules', {
    staleTime: 0,
  });
  const schedules = listQuery.data?.schedules;
  const listError = listQuery.error?.message;

  // The one picked, or the first in the list (the latest start); a picked one that is gone falls
  // back too.
  const shown = schedules?.find((item) => item.id === pickedId) ?? schedules?.[0];
  const shownId = shown?.id;

  // One cached answer per schedule, so a slow answer for another one is never shown as this one's.
  const detailQuery = useApiQuery<ScheduleDetail>(
    apiKey('/api/schedules', shownId),
    `/api/schedules/${shownId}`,
    { enabled: shownId !== undefined, staleTime: 0 },
  );
  const shownDetail = detailQuery.data;
  // While the days are read again the error is hidden, so a second failure is announced anew.
  const shownError = detailQuery.isFetching ? undefined : detailQuery.error?.message;

  const sendRequest = useApiMutation<ScheduleDetail, ApiRequest>((request) => request);
  const deleteRequest = useApiMutation<unknown, number>((id) => ({
    path: `/api/schedules/${id}`,
    method: 'DELETE',
  }));

  // Shows a schedule's days at once, and even if reading them again fails.
  const showDetail = (data: ScheduleDetail) =>
    client.setQueryData(apiKey('/api/schedules', data.schedule.id), data);
  // Reads the list and the days shown again, once what was just changed has been drawn.
  const [reloads, setReloads] = useState(0);
  const reload = () => setReloads((count) => count + 1);
  useEffect(() => {
    if (reloads > 0) void client.invalidateQueries({ queryKey: listKey });
  }, [reloads, client]);

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
      const data = await sendRequest.mutateAsync({
        path: '/api/schedules',
        method: 'POST',
        body: schedule,
      });
      showDetail(data);
      setPickedId(data.schedule.id);
      client.setQueryData<{ schedules: Schedule[] }>(listKey, (old) => ({
        schedules: [data.schedule, ...(old?.schedules ?? [])],
      }));
      setNotice({ kind: 'status', text: 'Schedule created' });
      setWantFocus('schedule-heading');
      reload();
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
    request: ApiRequest,
    success: string,
    focus: string,
    focusIfRefused: string = focus,
  ) => {
    nameNext(name);
    if (!begin()) return;
    clearNotices();
    try {
      showDetail(await sendRequest.mutateAsync(request));
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
      reload();
      end();
    }
  };

  const toggleDay = (scheduleId: number, id: number, done: boolean) =>
    changeDay(
      'toggle',
      id,
      { path: `/api/schedules/${scheduleId}/items/${id}/${done ? 'reopen' : 'complete'}` },
      done ? 'Completion undone' : 'Marked as done',
      `schedule-day-check-${id}`,
    );

  const moveDay = (scheduleId: number, target: Moving) =>
    changeDay(
      'move',
      target.id,
      {
        path: `/api/schedules/${scheduleId}/items/${target.id}/date`,
        method: 'PUT',
        body: { date: target.date, withLater: target.withLater },
      },
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
      await deleteRequest.mutateAsync(id);
      // At once, and even if reading the list again fails.
      client.setQueryData<{ schedules: Schedule[] }>(
        listKey,
        (old) => old && { schedules: old.schedules.filter((item) => item.id !== id) },
      );
      setListNotice({ kind: 'status', text: 'Schedule deleted' });
      setWantFocus('schedules-heading');
    } catch (failure) {
      const { status, message } = failure as RequestError;
      setListNotice({ kind: 'alert', text: message });
      // Already gone elsewhere, so the button it would go back to goes with the reload.
      setWantFocus(status === 404 ? 'schedules-heading' : `schedule-delete-${id}`);
    } finally {
      setConfirming(undefined);
      reload();
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
      const data = await sendRequest.mutateAsync({
        path: `/api/schedules/${target.id}`,
        method: 'PUT',
        body: { title: target.title },
      });
      showDetail(data);
      // At once, and even if reading the list again fails.
      client.setQueryData<{ schedules: Schedule[] }>(
        listKey,
        (old) =>
          old && {
            schedules: old.schedules.map((item) =>
              item.id === target.id ? { ...item, title: data.schedule.title } : item,
            ),
          },
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
      reload();
      end();
    }
  };

  const pick = (id: number) => {
    setPickedId(id);
    setConfirming(undefined);
    clearNotices();
    setMoving(undefined);
    setRenaming(undefined);
    // Also the way to try again after its days could not be read: the shown error leaves while
    // they are read, so a second failure is announced anew. A schedule newly picked reads its own
    // days as it is shown.
    if (id === shownId) void client.invalidateQueries({ queryKey: listKey });
    else void client.invalidateQueries({ queryKey: listKey, exact: true });
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
        onPick={pick}
        onAskDelete={(id) => setConfirming(id)}
        onCancelDelete={(id) => {
          setConfirming(undefined);
          setWantFocus(`schedule-delete-${id}`);
        }}
        onDelete={remove}
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
