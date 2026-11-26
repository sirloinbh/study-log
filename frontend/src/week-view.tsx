import React, { useState } from 'react';

import { Button } from './components/ui/button';
import { apiKey, useApiQuery } from './lib/query';
import { Loading } from './loading';
import { shiftDays } from './retrospective';
import { formatMinutes, studiedLabel, type StudyLog } from './study-logs-data';
import { weekdayNames } from './study-stats';
import { weekDays, weekStartOf } from './week-data';

// One week of study logs (#420), Sunday to Saturday: minutes per day and the sessions of each day.
export function WeekView({ today }: { today: string }) {
  const [start, setStart] = useState(() => weekStartOf(today));
  const end = shiftDays(start, 6);
  const query = useApiQuery<{ studyLogs: StudyLog[] }>(
    apiKey('/api/study-logs', 'week', start),
    `/api/study-logs?from=${start}&to=${end}&limit=100`,
  );
  const days = query.data ? weekDays(start, query.data.studyLogs) : undefined;
  const total = days?.reduce((sum, day) => sum + day.minutes, 0) ?? 0;

  return (
    <section className="card min-w-0" aria-label="Week">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => setStart(shiftDays(start, -7))}>
          Previous week
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={start === weekStartOf(today)}
          onClick={() => setStart(weekStartOf(today))}
        >
          This week
        </Button>
        <Button type="button" variant="outline" onClick={() => setStart(shiftDays(start, 7))}>
          Next week
        </Button>
      </div>
      <h2>
        {start} – {end}
      </h2>
      {query.error ? (
        <p role="alert" className="error">
          Could not load the week: {query.error.message}
        </p>
      ) : !days ? (
        <Loading label="Loading the week" kind="text" />
      ) : (
        <>
          <p className="status">Total {formatMinutes(total)}</p>
          <ul className="m-0 list-none p-0">
            {days.map((day, index) => (
              <li key={day.date} className="border-t border-border py-2">
                <h3 className="m-0 text-[14px]">
                  {weekdayNames[index]} {day.date} · {formatMinutes(day.minutes)}
                </h3>
                {day.logs.length === 0 ? (
                  <p className="status m-0">No study logs</p>
                ) : (
                  <ul className="m-0 list-none p-0">
                    {day.logs.map((log) => (
                      <li key={log.id} className="text-[14px]">
                        {log.startTime}–{log.endTime} ({formatMinutes(log.durationMinutes)})
                        {studiedLabel(log) ? ` · ${studiedLabel(log)}` : ''}
                        {log.status === 'planned' ? ' · Planned' : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
