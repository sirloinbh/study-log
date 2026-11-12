import React, { useEffect, useState } from 'react';

import { type RequestError, requestJson } from './api';
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
  // Kept per month and per day, so a slow answer for another one never shows here.
  const [months, setMonths] = useState<Record<string, CalendarDay[]>>({});
  const [dayLogs, setDayLogs] = useState<Record<string, StudyLog[]>>({});
  // Failures, each tagged with the month or day it was for, so one never hides or clears the other.
  const [monthError, setMonthError] = useState<{ month: string; message: string }>();
  const [dayError, setDayError] = useState<{ date: string; message: string }>();

  useEffect(() => {
    let current = true;
    requestJson<{ month: string; days: CalendarDay[] }>(`/api/study-logs/calendar?month=${month}`)
      .then((data) => {
        if (!current) return;
        setMonths((all) => ({ ...all, [data.month]: data.days }));
        setMonthError((failed) => (failed?.month === month ? undefined : failed));
      })
      .catch(
        (failure: RequestError) => current && setMonthError({ month, message: failure.message }),
      );
    return () => {
      current = false;
    };
  }, [month, reloadKey]);

  useEffect(() => {
    let current = true;
    requestJson<{ studyLogs: StudyLog[] }>(`/api/study-logs?date=${selected}`)
      .then((data) => {
        if (!current) return;
        setDayLogs((all) => ({ ...all, [selected]: data.studyLogs }));
        setDayError((failed) => (failed?.date === selected ? undefined : failed));
      })
      .catch(
        (failure: RequestError) =>
          current && setDayError({ date: selected, message: failure.message }),
      );
    return () => {
      current = false;
    };
  }, [selected, reloadKey]);

  const days = months[month];
  const logs = dayLogs[selected];
  const error = monthError?.month === month ? monthError.message : undefined;
  const logsError = dayError?.date === selected ? dayError.message : undefined;

  const describe = (day: CalendarDay) =>
    `${day.date}, ${day.minutes ? `studied ${formatMinutes(day.minutes)}` : 'no study'}, ` +
    `${day.logs} ${day.logs === 1 ? 'log' : 'logs'}`;

  return (
    <section className="card study-calendar" aria-label="Study calendar">
      <div className="calendar-head">
        <h2>{monthTitle(month)}</h2>
        <div className="actions">
          <button
            type="button"
            className="secondary"
            aria-label="Previous month"
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            Previous
          </button>
          {month !== today.slice(0, 7) && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setMonth(today.slice(0, 7));
                setSelected(today);
              }}
            >
              This month
            </button>
          )}
          <button
            type="button"
            className="secondary"
            aria-label="Next month"
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            Next
          </button>
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
        <div className="calendar-grid">
          {weekdays.map((name) => (
            <span key={name} className="calendar-weekday" aria-hidden="true">
              {name}
            </span>
          ))}
          {calendarCells(days).map((day, index) =>
            day ? (
              <button
                key={day.date}
                type="button"
                className={[
                  'calendar-day',
                  day.minutes > 0 ? 'studied' : '',
                  day.date === today ? 'today' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-pressed={day.date === selected}
                aria-label={describe(day)}
                onClick={() => setSelected(day.date)}
              >
                <span className="calendar-date">{Number(day.date.slice(8))}</span>
                <span className="calendar-minutes">{shortMinutes(day.minutes)}</span>
              </button>
            ) : (
              <span key={`before-${index}`} aria-hidden="true" />
            ),
          )}
        </div>
      )}
      <div className="calendar-logs">
        <h3>Logs for {selected}</h3>
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
