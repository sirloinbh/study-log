import React, { useState } from 'react';

import { Button } from './components/ui/button';
import { apiKey, useApiQuery } from './lib/query';
import { Loading } from './loading';
import { formatMinutes, studiedLabel, type StudyLog } from './study-logs-data';
import { addDays, weekDays, weekStart, weekTitle } from './week-range';

const weekdayName = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });

// One week of study logs (#420): the seven days Sunday to Saturday with the logs of each day and the
// time studied. Earlier weeks can be opened; there is no later week than this one.
export function Week({ today }: { today: string }) {
  const thisWeek = weekStart(today);
  const [start, setStart] = useState(thisWeek);
  const days = weekDays(start);
  const path = `/api/study-logs?from=${days[0]}&to=${days[6]}&limit=100`;
  const query = useApiQuery<{ studyLogs: StudyLog[] }>(
    apiKey('/api/study-logs', 'week', start),
    path,
  );
  const logs = query.data?.studyLogs;
  const error = query.isFetching ? undefined : query.error?.message;
  const total = logs?.reduce((sum, log) => sum + log.durationMinutes, 0) ?? 0;

  return (
    <section className="card" aria-label="Week">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0">{weekTitle(start)}</h2>
        <div className="actions">
          <Button
            type="button"
            variant="outline"
            aria-label="Previous week"
            onClick={() => setStart(addDays(start, -7))}
          >
            Previous
          </Button>
          {start !== thisWeek && (
            <Button type="button" variant="outline" onClick={() => setStart(thisWeek)}>
              This week
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            aria-label="Next week"
            disabled={start >= thisWeek}
            onClick={() => setStart(addDays(start, 7))}
          >
            Next
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="error">
          Could not load the week: {error}
        </p>
      )}
      {logs === undefined ? (
        !error && <Loading label="Loading the week" />
      ) : (
        <>
          <p className="status" role="status">
            {total === 0 ? 'No study this week' : `Studied ${formatMinutes(total)} this week`}
          </p>
          <ul className="log-list">
            {days.map((day) => {
              const dayLogs = logs.filter((log) => log.studyDate === day);
              const minutes = dayLogs.reduce((sum, log) => sum + log.durationMinutes, 0);
              return (
                <li key={day} aria-label={`${weekdayName(day)} ${day}`}>
                  <div className="log-head">
                    <strong>{weekdayName(day)}</strong>
                    <span className="log-date">{day}</span>
                    <span>{minutes > 0 ? formatMinutes(minutes) : 'No study'}</span>
                  </div>
                  {dayLogs.map((log) => (
                    <p key={log.id} className="log-studied">
                      {log.startTime}–{log.endTime} · {formatMinutes(log.durationMinutes)}
                      {studiedLabel(log) ? ` · ${studiedLabel(log)}` : ''}
                    </p>
                  ))}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
