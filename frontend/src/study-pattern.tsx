import React from 'react';

import { apiKey, useApiQuery } from './lib/query';
import { Loading } from './loading';
import { formatMinutes } from './study-logs-data';
import { barWidth, hourLabel, type StudyPattern as Pattern, weekdayNames } from './study-stats';

// When study went best in a period (#20): the busiest hour and weekday, and minutes per hour
// and weekday as bars. Shown on the retrospective of that period; `reloadKey` changes with it.
export function StudyPattern({
  from,
  to,
  reloadKey,
}: {
  from: string;
  to: string;
  reloadKey?: number;
}) {
  // One cached answer per period, so a slow answer for another period never shows here. `reloadKey`
  // changes when the retrospective is saved, so the pattern is read again.
  const query = useApiQuery<Pattern>(
    apiKey('/api/stats/patterns', from, to, reloadKey),
    `/api/stats/patterns?from=${from}&to=${to}`,
  );
  const pattern = query.data;
  const failed = query.error?.message;

  return (
    <section className="mt-5 border-t border-border pt-4" aria-label="Study pattern">
      <h3 className="m-0 mb-2 text-[14px]">Study pattern</h3>
      {failed ? (
        <p role="alert" className="error">
          Could not load the study pattern: {failed}
        </p>
      ) : !pattern ? (
        <Loading label="Loading the study pattern" kind="text" />
      ) : pattern.topHour === null || pattern.topWeekday === null ? (
        <p className="status">
          There are no study logs in this period, so there is no pattern to show
        </p>
      ) : (
        <>
          <p className="m-0 mb-3">
            You study most at <strong>{hourLabel(pattern.topHour)}</strong> (
            {formatMinutes(pattern.byHour[pattern.topHour])}), and on{' '}
            <strong>{weekdayNames[pattern.topWeekday]}</strong> (
            {formatMinutes(pattern.byWeekday[pattern.topWeekday])}).
          </p>
          <div className="mb-4 grid gap-1" aria-label="Study time by weekday">
            {pattern.byWeekday.map((minutes, day) => (
              <div
                key={day}
                className="grid grid-cols-[20px_minmax(0,1fr)_84px] items-center gap-2 text-[12px]"
              >
                <span>{weekdayNames[day]}</span>
                <span className="h-2.5 rounded-[3px] bg-muted" aria-hidden="true">
                  <span
                    data-bar
                    className="block h-full rounded-[3px] bg-ring"
                    style={{ width: barWidth(minutes, pattern.byWeekday) }}
                  />
                </span>
                <span className="text-right whitespace-nowrap text-muted-foreground">
                  {minutes ? formatMinutes(minutes) : '—'}
                </span>
              </div>
            ))}
          </div>
          {/* Twenty-four thin columns, midnight first. The bars are for sight; the values are in a
              list for screen readers and touch users, who have no tooltip. */}
          <div
            className="grid h-16 grid-cols-[repeat(24,minmax(0,1fr))] items-end gap-0.5 border-b border-border"
            aria-hidden="true"
          >
            {pattern.byHour.map((minutes, hour) => (
              <span
                key={hour}
                data-hour
                data-top={hour === pattern.topHour ? '' : undefined}
                className={`block min-h-px rounded-t-[2px] ${hour === pattern.topHour ? 'bg-primary' : 'bg-[color-mix(in_oklch,var(--foreground)_18%,transparent)]'}`}
                title={`${hourLabel(hour)}: ${formatMinutes(minutes)}`}
                style={{ height: barWidth(minutes, pattern.byHour) }}
              />
            ))}
          </div>
          <ul className="sr-only" aria-label="Study time by hour">
            {pattern.byHour.map((minutes, hour) => (
              <li key={hour}>
                {hourLabel(hour)}: {minutes ? formatMinutes(minutes) : 'no study'}
              </li>
            ))}
          </ul>
          <div
            className="flex justify-between text-[11px] text-muted-foreground"
            aria-hidden="true"
          >
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>24:00</span>
          </div>
        </>
      )}
    </section>
  );
}
