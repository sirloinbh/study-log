import React, { useEffect, useState } from 'react';

import { type RequestError, requestJson } from './api';
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
  // Kept per period, so a slow answer for another period never shows here.
  const [patterns, setPatterns] = useState<Record<string, Pattern>>({});
  const [error, setError] = useState<{ key: string; message: string }>();
  const key = `${from}~${to}`;

  useEffect(() => {
    let current = true;
    requestJson<Pattern>(`/api/stats/patterns?from=${from}&to=${to}`)
      .then((data) => {
        if (!current) return;
        setPatterns((all) => ({ ...all, [`${from}~${to}`]: data }));
        setError((failed) => (failed?.key === `${from}~${to}` ? undefined : failed));
      })
      .catch(
        (failure: RequestError) =>
          current && setError({ key: `${from}~${to}`, message: failure.message }),
      );
    return () => {
      current = false;
    };
  }, [from, to, reloadKey]);

  const pattern = patterns[key];
  const failed = error?.key === key ? error.message : undefined;

  return (
    <section className="study-pattern" aria-label="Study pattern">
      <h3>Study pattern</h3>
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
          <p className="pattern-summary">
            You study most at <strong>{hourLabel(pattern.topHour)}</strong> (
            {formatMinutes(pattern.byHour[pattern.topHour])}), and on{' '}
            <strong>{weekdayNames[pattern.topWeekday]}</strong> (
            {formatMinutes(pattern.byWeekday[pattern.topWeekday])}).
          </p>
          <div className="pattern-bars" aria-label="Study time by weekday">
            {pattern.byWeekday.map((minutes, day) => (
              <div key={day} className="pattern-row">
                <span className="pattern-name">{weekdayNames[day]}</span>
                <span className="pattern-track" aria-hidden="true">
                  <span
                    className="pattern-bar"
                    style={{ width: barWidth(minutes, pattern.byWeekday) }}
                  />
                </span>
                <span className="pattern-value">{minutes ? formatMinutes(minutes) : '—'}</span>
              </div>
            ))}
          </div>
          {/* Twenty-four thin columns, midnight first; each hour's value is in its tooltip. */}
          <div className="pattern-hours" role="img" aria-label="Study time by hour">
            {pattern.byHour.map((minutes, hour) => (
              <span
                key={hour}
                className={hour === pattern.topHour ? 'pattern-hour top' : 'pattern-hour'}
                title={`${hourLabel(hour)}: ${formatMinutes(minutes)}`}
                style={{ height: barWidth(minutes, pattern.byHour) }}
              />
            ))}
          </div>
          <div className="pattern-axis" aria-hidden="true">
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
