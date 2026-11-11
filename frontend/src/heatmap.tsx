import React, { useEffect, useState } from 'react';

import { type RequestError, requestJson } from './api';
import { Loading } from './loading';
import { formatMinutes } from './study-logs-data';
import { type DayMinutes, heatBands, heatLevel, heatWeeks, monthLabel } from './study-stats';

// Rows run Sunday to Saturday (#96); Monday, Wednesday and Friday are labelled.
const weekdays = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

// The last year of study as a GitHub-style heatmap (#50): one column per week, Sunday on top.
export function Heatmap() {
  const [data, setData] = useState<{ from: string; to: string; daily: DayMinutes[] }>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let current = true;
    requestJson<{ from: string; to: string; daily: DayMinutes[] }>('/api/stats/heatmap')
      .then((loaded) => current && setData(loaded))
      .catch((failure: RequestError) => current && setError(failure.message));
    return () => {
      current = false;
    };
  }, []);

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
            {studied.length} study days · total {formatMinutes(total)}
          </p>
          <div className="heatmap-scroll" id="heatmap-scroll">
            {/* One image for screen readers; each day's value is in its tooltip for the mouse. */}
            <div
              className="heatmap"
              role="img"
              aria-label={`${data.from} to ${data.to}: ${studied.length} study days, total ${formatMinutes(total)}`}
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
