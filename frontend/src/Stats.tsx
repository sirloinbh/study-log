import React, { useEffect, useState } from 'react';
import { requestJson, type RequestError } from './api';
import { periodLabels, statPeriods, type StatPeriod, type StudyTimeStats } from './study-stats';
import { formatMinutes } from './study-logs';

// Study time dashboard (#48): metric cards for the all-time total, today, the picked period and
// its daily average, from GET /api/stats/study-time (#47). Charts come with #49.
export function Stats() {
  const [period, setPeriod] = useState<StatPeriod>('week');
  // Kept per period, so a slow answer for another period never replaces or hides this one's.
  const [loaded, setLoaded] = useState<Partial<Record<StatPeriod, StudyTimeStats>>>({});
  const [loadError, setLoadError] = useState<{ period: StatPeriod; message: string }>();

  useEffect(() => {
    let current = true;
    requestJson<StudyTimeStats>(`/api/stats/study-time?period=${period}`)
      .then((data) => {
        if (!current) return;
        setLoaded((all) => ({ ...all, [period]: data }));
        setLoadError((failed) => (failed?.period === period ? undefined : failed));
      })
      .catch((error: RequestError) => {
        if (current) setLoadError({ period, message: error.message });
      });
    return () => {
      current = false;
    };
  }, [period]);

  const stats = loaded[period];
  const error = loadError?.period === period ? loadError.message : undefined;
  const label = periodLabels[period];

  return (
    <div className="stats">
      <div className="period-filter" role="group" aria-label="기간">
        {statPeriods.map((key) => (
          <button
            key={key}
            type="button"
            className={key === period ? 'primary' : 'secondary'}
            aria-pressed={key === period}
            onClick={() => setPeriod(key)}
          >
            {periodLabels[key]}
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="error">
          통계를 불러오지 못했습니다: {error}
        </p>
      ) : !stats ? (
        <p role="status" className="status">
          불러오는 중…
        </p>
      ) : (
        <section className="metric-grid" aria-label="학습 시간 지표">
          <article className="card metric">
            <h2>총 학습 시간</h2>
            <p className="metric-value">{formatMinutes(stats.cumulativeMinutes)}</p>
            <p className="status">지금까지 기록한 전체</p>
          </article>
          <article className="card metric">
            <h2>오늘</h2>
            <p className="metric-value">{formatMinutes(stats.todayMinutes)}</p>
            <p className="status">{stats.to}</p>
          </article>
          <article className="card metric">
            <h2>{label}</h2>
            <p className="metric-value">{formatMinutes(stats.totalMinutes)}</p>
            {/* Breaks only around "~", never inside a date. */}
            <p className="status">
              <span className="nowrap">{stats.from}</span> ~{' '}
              <span className="nowrap">{stats.to}</span>
            </p>
            <p className="status">
              {stats.days}일 중 {stats.studyDays}일 공부
            </p>
          </article>
          <article className="card metric">
            <h2>하루 평균</h2>
            <p className="metric-value">{formatMinutes(stats.averageMinutesPerDay)}</p>
            <p className="status">{label} 기준</p>
            <p className="status">공부한 날만 {formatMinutes(stats.averageMinutesPerStudyDay)}</p>
          </article>
        </section>
      )}
    </div>
  );
}
