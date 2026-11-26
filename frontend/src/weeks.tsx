import React from 'react';

import { apiKey, useApiQuery } from './lib/query';
import { Loading } from './loading';
import { plural } from './plural';
import { formatMinutes } from './study-logs-data';
import type { DayMinutes } from './study-stats';
import { recentWeeks, weekTitle } from './week-range';

const weekCount = 12;

// The last 12 weeks side by side (#420): the time studied and the number of study days in each,
// newest first, from the same daily totals as the heatmap.
export function Weeks({ today }: { today: string }) {
  const query = useApiQuery<{ from: string; to: string; daily: DayMinutes[] }>(
    apiKey('/api/stats/heatmap'),
    '/api/stats/heatmap',
  );
  const error = query.isFetching ? undefined : query.error?.message;
  if (!query.data) {
    return error ? (
      <p role="alert" className="error">
        Could not load the weeks: {error}
      </p>
    ) : (
      <Loading label="Loading the weeks" />
    );
  }
  const weeks = recentWeeks(query.data.daily, today, weekCount);
  const most = Math.max(1, ...weeks.map((week) => week.minutes));
  return (
    <section className="card" aria-label="12 weeks">
      <h2>Last {weekCount} weeks</h2>
      <ul className="log-list">
        {weeks.map((week) => (
          <li key={week.start}>
            <div className="log-head">
              <strong>{weekTitle(week.start)}</strong>
              <span>
                {week.minutes > 0 ? formatMinutes(week.minutes) : 'No study'}
                {week.studyDays > 0 && ` · ${plural(week.studyDays, 'day')}`}
              </span>
            </div>
            <div aria-hidden="true" className="mt-2 h-2 rounded bg-muted">
              <div
                className="h-2 rounded bg-primary"
                style={{ width: `${Math.round((week.minutes / most) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
