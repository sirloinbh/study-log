import React, { useEffect, useState } from 'react';
import { requestJson, type RequestError } from './api';
import {
  calendarCells,
  monthTitle,
  shiftMonth,
  shortMinutes,
  type CalendarDay,
} from './month-calendar';
import { formatMinutes, statusLabels, type StudyLog } from './study-logs';

const weekdays = ['월', '화', '수', '목', '금', '토', '일'];

// Study log calendar (#17): a month of days with the time studied, and the logs of the picked
// day. `reloadKey` changes when logs were saved or deleted on the page.
export function Calendar({ today, reloadKey }: { today: string; reloadKey?: number }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  // Kept per month and per day, so a slow answer for another one never shows here.
  const [months, setMonths] = useState<Record<string, CalendarDay[]>>({});
  const [dayLogs, setDayLogs] = useState<Record<string, StudyLog[]>>({});
  const [error, setError] = useState<string>();

  useEffect(() => {
    let current = true;
    requestJson<{ month: string; days: CalendarDay[] }>(`/api/study-logs/calendar?month=${month}`)
      .then((data) => {
        if (!current) return;
        setMonths((all) => ({ ...all, [data.month]: data.days }));
        setError(undefined);
      })
      .catch((failure: RequestError) => current && setError(failure.message));
    return () => {
      current = false;
    };
  }, [month, reloadKey]);

  useEffect(() => {
    let current = true;
    requestJson<{ studyLogs: StudyLog[] }>(`/api/study-logs?date=${selected}`)
      .then((data) => current && setDayLogs((all) => ({ ...all, [selected]: data.studyLogs })))
      .catch((failure: RequestError) => current && setError(failure.message));
    return () => {
      current = false;
    };
  }, [selected, reloadKey]);

  const days = months[month];
  const logs = dayLogs[selected];

  const describe = (day: CalendarDay) =>
    `${day.date}, ${day.minutes ? `학습 ${formatMinutes(day.minutes)}` : '학습 없음'}, ` +
    `기록 ${day.logs}개`;

  return (
    <section className="card study-calendar" aria-label="학습 캘린더">
      <div className="calendar-head">
        <h2>{monthTitle(month)}</h2>
        <div className="actions">
          <button
            type="button"
            className="secondary"
            aria-label="이전 달"
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            이전
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
              이번 달
            </button>
          )}
          <button
            type="button"
            className="secondary"
            aria-label="다음 달"
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            다음
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="error">
          캘린더를 불러오지 못했습니다: {error}
        </p>
      )}
      {!days ? (
        !error && (
          <p role="status" className="status">
            불러오는 중…
          </p>
        )
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
        <h3>{selected} 일지</h3>
        {logs === undefined ? (
          <p className="status">불러오는 중…</p>
        ) : logs.length === 0 ? (
          <p className="status">이 날짜의 기록이 없습니다</p>
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
                </div>
                {log.memo && <p className="log-memo">{log.memo}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
