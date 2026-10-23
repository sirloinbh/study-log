import React, { useEffect, useState } from 'react';
import { requestJson, type RequestError } from './api';
import { formatMinutes } from './study-logs';
import { heatBands, heatLevel, heatWeeks, monthLabel, type DayMinutes } from './study-stats';

const weekdays = ['월', '', '수', '', '금', '', ''];

// The last year of study as a GitHub-style heatmap (#50): one column per week, Monday on top.
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
    <section className="card heatmap-card" aria-label="최근 1년 학습">
      <h2>최근 1년</h2>
      {error ? (
        <p role="alert" className="error">
          히트맵을 불러오지 못했습니다: {error}
        </p>
      ) : !data ? (
        <p role="status" className="status">
          불러오는 중…
        </p>
      ) : (
        <>
          <p className="status">
            {studied.length}일 공부 · 총 {formatMinutes(total)}
          </p>
          <div className="heatmap-scroll" id="heatmap-scroll">
            {/* One image for screen readers; each day's value is in its tooltip for the mouse. */}
            <div
              className="heatmap"
              role="img"
              aria-label={`${data.from}부터 ${data.to}까지 ${studied.length}일 공부, 총 ${formatMinutes(total)}`}
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
          <ul className="heat-legend" aria-label="강도 구간">
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
