import React, { useEffect } from 'react';

import { apiKey, useApiQuery } from './lib/query';
import { Loading } from './loading';
import { plural } from './plural';
import { formatMinutes } from './study-logs-data';
import { type DayMinutes, heatBands, heatLevel, heatWeeks, monthLabel } from './study-stats';

// Rows run Sunday to Saturday (#96); Monday, Wednesday and Friday are labelled.
const weekdays = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

// The last year of study as a GitHub-style heatmap (#50): one column per week, Sunday on top.
export function Heatmap() {
  const query = useApiQuery<{ from: string; to: string; daily: DayMinutes[] }>(
    apiKey('/api/stats/heatmap'),
    '/api/stats/heatmap',
  );
  const data = query.data;
  const error = query.error?.message;

  // On a narrow screen the weeks scroll sideways; start at the recent end.
  useEffect(() => {
    if (!data) return;
    const scroller = document.getElementById('heatmap-scroll') as {
      scrollLeft: number;
      scrollWidth: number;
    } | null;
    if (scroller) scroller.scrollLeft = scroller.scrollWidth;
  }, [data]);

  const studied = data?.daily.filter((day) => day.minutes > 0) ?? [];
  const total = studied.reduce((sum, day) => sum + day.minutes, 0);

  return (
    <section className="card heatmap-card" aria-label="Study in the last year">
      <h2>Last year</h2>
      {error ? (
        <p role="alert" className="error">
          Could not load the heatmap: {error}
        </p>
      ) : !data ? (
        <Loading label="Loading the heatmap" kind="text" />
      ) : (
        <>
          <p className="status">
            {plural(studied.length, 'study day')} · total {formatMinutes(total)}
          </p>
          <div className="heatmap-scroll" id="heatmap-scroll">
            {/* One image for screen readers; each day's value is in its tooltip for the mouse. */}
            <div
              className="heatmap"
              role="img"
              aria-label={`${data.from} to ${data.to}: ${plural(studied.length, 'study day')}, total ${formatMinutes(total)}`}
            >
              <div className="heat-days" aria-hidden="true">
                <span className="heat-month" />
                {weekdays.map((day, index) => (
                  <span key={index}>{day}</span>
                ))}
              </div>
              {heatWeeks(data.daily).map((week) => (
                <div key={week[0]?.date} className="heat-week" aria-hidden="true">
                  <span className="heat-month">{monthLabel(week)}</span>
                  {week.map((day, index) =>
                    day ? (
                      <span
                        key={day.date}
                        className={`heat-cell level-${heatLevel(day.minutes)}`}
                        title={`${day.date}: ${formatMinutes(day.minutes)}`}
                      />
                    ) : (
                      <span key={`after-${index}`} className="heat-cell future" />
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
          <ul className="heat-legend" aria-label="Intensity levels">
            {heatBands.map((band) => (
              <li key={band.level}>
                <span className={`heat-cell level-${band.level}`} aria-hidden="true" />
                {band.label}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
