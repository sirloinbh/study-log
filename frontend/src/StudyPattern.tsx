import React, { useEffect, useState } from 'react';
import { requestJson, type RequestError } from './api';
import { barWidth, hourLabel, weekdayNames, type StudyPattern as Pattern } from './study-stats';
import { formatMinutes } from './study-logs';

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
    <section className="study-pattern" aria-label="학습 패턴">
      <h3>학습 패턴</h3>
      {failed ? (
        <p role="alert" className="error">
          학습 패턴을 불러오지 못했습니다: {failed}
        </p>
      ) : !pattern ? (
        <p className="status">불러오는 중…</p>
      ) : pattern.topHour === null || pattern.topWeekday === null ? (
        <p className="status">이 기간에는 학습 기록이 없어 패턴을 볼 수 없습니다</p>
      ) : (
        <>
          <p className="pattern-summary">
            가장 많이 공부한 시간대는 <strong>{hourLabel(pattern.topHour)}</strong>(
            {formatMinutes(pattern.byHour[pattern.topHour])}), 요일은{' '}
            <strong>{weekdayNames[pattern.topWeekday]}요일</strong>(
            {formatMinutes(pattern.byWeekday[pattern.topWeekday])})입니다.
          </p>
          <div className="pattern-bars" aria-label="요일별 학습 시간">
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
          <div className="pattern-hours" role="img" aria-label="시간대별 학습 시간">
            {pattern.byHour.map((minutes, hour) => (
              <span
                key={hour}
                className={`pattern-hour${hour === pattern.topHour ? ' top' : ''}`}
                title={`${hourLabel(hour)}: ${formatMinutes(minutes)}`}
                style={{ height: barWidth(minutes, pattern.byHour) }}
              />
            ))}
          </div>
          <div className="pattern-axis" aria-hidden="true">
            <span>0시</span>
            <span>6시</span>
            <span>12시</span>
            <span>18시</span>
            <span>24시</span>
          </div>
        </>
      )}
    </section>
  );
}
