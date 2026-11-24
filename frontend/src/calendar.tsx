import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useRef, useState } from 'react';

import { Button } from './components/ui/button';
import { apiKey, useApiQuery } from './lib/query';
import { Loading } from './loading';
import { Memo } from './memo';
import {
  calendarCells,
  type CalendarDay,
  monthTitle,
  shiftMonth,
  shortMinutes,
} from './month-calendar';
import { formatMinutes, statusLabels, type StudyLog } from './study-logs-data';

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Study log calendar (#17): a month of days with the time studied, and the logs of the picked
// day. `reloadKey` changes when logs were saved or deleted on the page.
export function Calendar({ today, reloadKey }: { today: string; reloadKey?: number }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  // One cached answer per month and per day, so a slow answer for another one never shows here.
  const client = useQueryClient();
  const monthKey = apiKey('/api/study-logs/calendar', month);
  const dayKey = apiKey('/api/study-logs', 'date', selected);
  const monthQuery = useApiQuery<{ month: string; days: CalendarDay[] }>(
    monthKey,
    `/api/study-logs/calendar?month=${month}`,
  );
  const dayQuery = useApiQuery<{ studyLogs: StudyLog[] }>(
    dayKey,
    `/api/study-logs?date=${selected}`,
  );

  // Logs saved or deleted elsewhere on the page: read what is shown again.
  const lastReload = useRef(reloadKey);
  useEffect(() => {
    if (lastReload.current === reloadKey) return;
    lastReload.current = reloadKey;
    void client.invalidateQueries({ queryKey: monthKey });
    void client.invalidateQueries({ queryKey: dayKey });
    // Only a change of reloadKey reads again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  const days = monthQuery.data?.days;
  const logs = dayQuery.data?.studyLogs;
  // The error is hidden while a failed read is tried again.
  const error = monthQuery.isFetching ? undefined : monthQuery.error?.message;
  const logsError = dayQuery.isFetching ? undefined : dayQuery.error?.message;

  const describe = (day: CalendarDay) =>
    `${day.date}, ${day.minutes ? `studied ${formatMinutes(day.minutes)}` : 'no study'}, ` +
    `${day.logs} ${day.logs === 1 ? 'log' : 'logs'}`;

  return (
    <section className="card" aria-label="Study calendar">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0">{monthTitle(month)}</h2>
        <div className="actions">
          <Button
            type="button"
            variant="outline"
            aria-label="Previous month"
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            Previous
          </Button>
          {month !== today.slice(0, 7) && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setMonth(today.slice(0, 7));
                setSelected(today);
              }}
            >
              This month
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            aria-label="Next month"
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            Next
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="error">
          Could not load the calendar: {error}
        </p>
      )}
      {!days ? (
        !error && <Loading label="Loading the calendar" kind="text" />
      ) : (
        <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] gap-1" data-calendar-grid>
          {weekdays.map((name) => (
            <span
              key={name}
              className="text-center text-[13px] text-muted-foreground"
              aria-hidden="true"
            >
              {name}
            </span>
          ))}
          {calendarCells(days).map((day, index) =>
            day ? (
              <button
                key={day.date}
                type="button"
                className={`flex min-h-[52px] flex-col items-center gap-0.5 rounded-[calc(var(--radius)-2px)] border border-border px-0.5 py-1.5 text-foreground aria-pressed:border-primary aria-pressed:shadow-[inset_0_0_0_1px_var(--primary)] ${day.minutes > 0 ? 'bg-muted' : 'bg-card'}`}
                aria-pressed={day.date === selected}
                aria-label={describe(day)}
                onClick={() => setSelected(day.date)}
              >
                <span
                  className={`text-[13px] ${day.date === today ? 'font-bold text-primary' : ''}`}
                >
                  {Number(day.date.slice(8))}
                </span>
                <span className="text-center text-[13px] leading-tight text-primary">
                  {shortMinutes(day.minutes)}
                </span>
              </button>
            ) : (
              <span key={`before-${index}`} aria-hidden="true" />
            ),
          )}
        </div>
      )}
      <div>
        <h3 className="mt-4 mb-2 text-[14px]">Logs for {selected}</h3>
        {logsError ? (
          <p role="alert" className="error">
            Could not load the logs: {logsError}
          </p>
        ) : logs === undefined ? (
          <Loading label="Loading the logs" />
        ) : logs.length === 0 ? (
          <p className="status">No logs on this date</p>
        ) : (
          <ul className="log-list">
            {logs.map((log) => (
              <li key={log.id}>
                <div className="log-head">
                  <span>
                    {log.startTime}–{log.endTime}
                  </span>
                  <strong>{formatMinutes(log.durationMinutes)}</strong>
                  <span className={`badge ${log.status}`}>{statusLabels[log.status]}</span>
                  {log.studyType === 'review' && <span className="badge">Review</span>}
                </div>
                {log.memo && <Memo text={log.memo} />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
