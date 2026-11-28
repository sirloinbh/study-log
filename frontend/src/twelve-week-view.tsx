import React from 'react';

import { type FinishedDay, finishedTotal, finishedWeeks } from './finished-stats';
import { plural } from './lib/format';
import { apiKey, useApiQuery } from './lib/query';
import { Loading } from './loading';
import { barWidth } from './study-stats';

// The last 12 weeks (#420, #481): one row per week with the chapters and sections finished and the
// days with a finish, read from the same daily series as the heatmap.
export function TwelveWeekView({ today }: { today: string }) {
  const query = useApiQuery<{ from: string; to: string; daily: FinishedDay[] }>(
    apiKey('/api/stats/finished-days'),
    '/api/stats/finished-days',
  );
  const weeks = query.data ? finishedWeeks(query.data.daily, today) : undefined;

  return (
    <section className="card min-w-0" aria-label="Last 12 weeks">
      <h2>Last 12 weeks</h2>
      {query.error ? (
        <p role="alert" className="error">
          Could not load the 12 weeks: {query.error.message}
        </p>
      ) : !weeks ? (
        <Loading label="Loading the 12 weeks" kind="text" />
      ) : (
        <ol className="m-0 grid list-none gap-1 p-0">
          {weeks.map((week, index) => {
            // The year shows on the first row and wherever it changes; the current week is named.
            const year = week.start.slice(0, 4);
            const showYear = index === 0 || year !== weeks[index - 1].start.slice(0, 4);
            const current = week.start <= today && today <= week.end;
            return (
              <li
                key={week.start}
                aria-current={current ? 'date' : undefined}
                className="grid grid-cols-[112px_minmax(0,1fr)_96px] items-center gap-2 text-[13px]"
              >
                <span className="whitespace-nowrap">
                  {week.start.slice(5)} – {week.end.slice(5)}
                  {(showYear || current) && (
                    <span className="block text-[13px] text-muted-foreground">
                      {[showYear ? year : '', current ? 'This week' : '']
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  )}
                </span>
                <span className="h-2.5 rounded-[3px] bg-muted" aria-hidden="true">
                  <span
                    data-bar
                    className="block h-full rounded-[3px] bg-ring"
                    style={{
                      width: barWidth(
                        finishedTotal(week),
                        weeks.map((w) => finishedTotal(w)),
                      ),
                    }}
                  />
                </span>
                <span className="whitespace-nowrap">
                  {plural(week.chapters, 'chapter')}
                  <span className="block">{plural(week.sections, 'section')}</span>
                  <span className="block text-[13px] text-muted-foreground">
                    {week.finishedDays} of 7 days
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
