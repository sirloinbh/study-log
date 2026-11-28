import React, { useState } from 'react';

import { addDays } from './components/period-nav/periods';
import { Button } from './components/ui/button';
import { type FinishedDay, finishedLabel } from './finished-stats';
import { apiKey, useApiQuery } from './lib/query';
import { Loading } from './loading';
import { studiedLabel, type StudyLog } from './study-logs-data';
import { weekdayNames } from './study-stats';
import { weekDays, weekStartOf } from './week-data';

// One week of study logs (#420), Sunday to Saturday: the chapters and sections finished each day
// (#481) and the sessions of each day.
export function WeekView({ today }: { today: string }) {
  const [start, setStart] = useState(() => weekStartOf(today));
  const end = addDays(start, 6);
  const query = useApiQuery<{ studyLogs: StudyLog[] }>(
    apiKey('/api/study-logs', 'week', start),
    `/api/study-logs?from=${start}&to=${end}&limit=100`,
  );
  const finishedQuery = useApiQuery<{ daily: FinishedDay[] }>(
    apiKey('/api/stats/finished-days', start),
    `/api/stats/finished-days?from=${start}&to=${end}`,
  );
  const days = query.data ? weekDays(start, query.data.studyLogs) : undefined;
  const finished = finishedQuery.data?.daily;
  const finishedOn = (date: string) => finished?.find((day) => day.date === date);
  const total = {
    chapters: finished?.reduce((sum, day) => sum + day.chapters, 0) ?? 0,
    sections: finished?.reduce((sum, day) => sum + day.sections, 0) ?? 0,
  };

  return (
    <section className="card min-w-0" aria-label="Days of the week">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => setStart(addDays(start, -7))}>
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
        <Button type="button" variant="outline" onClick={() => setStart(addDays(start, 7))}>
          Next week
        </Button>
      </div>
      <h2>
        {start} – {end}
      </h2>
      {query.error || finishedQuery.error ? (
        <p role="alert" className="error">
          Could not load the week: {(query.error ?? finishedQuery.error)?.message}
        </p>
      ) : !days || !finished ? (
        <Loading label="Loading the week" kind="text" />
      ) : (
        <>
          <p className="status">Finished {finishedLabel(total)}</p>
          <ul className="m-0 list-none p-0">
            {days.map((day, index) => (
              <li key={day.date} className="border-t border-border py-2">
                <h3 className="m-0 text-[14px]">
                  {weekdayNames[index]} {day.date} ·{' '}
                  {finishedLabel(finishedOn(day.date) ?? { chapters: 0, sections: 0 })}
                </h3>
                {day.logs.length === 0 ? (
                  <p className="status m-0">No study logs</p>
                ) : (
                  <ul className="m-0 list-none p-0">
                    {day.logs.map((log) => (
                      <li key={log.id} className="text-[14px]">
                        {log.startTime}–{log.endTime}
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
