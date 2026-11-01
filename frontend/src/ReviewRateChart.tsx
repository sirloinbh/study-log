import React, { useEffect, useState } from 'react';

import { type RequestError, requestJson } from './api';
import { periodLabels, reviewBars, type ReviewStats, type StatPeriod } from './study-stats';
import { useRecharts } from './use-recharts';

// A component of its own so the chart library is loaded only once there is something to draw.
function ReviewBars({ stats }: { stats: ReviewStats }) {
  const { charts: R, chartError } = useRecharts();
  if (chartError)
    return (
      <p role="alert" className="error">
        그래프를 불러오지 못했습니다: {chartError}
      </p>
    );
  if (!R) return <p className="status">그래프를 불러오는 중…</p>;
  return (
    <div className="chart-box" aria-hidden="true">
      <R.ResponsiveContainer width="100%" height={200}>
        <R.BarChart data={reviewBars(stats)} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <R.CartesianGrid vertical={false} stroke="var(--border)" />
          {/* Every label, since the counts are read from them. */}
          <R.XAxis dataKey="label" interval={0} tickLine={false} fontSize={12} />
          <R.YAxis hide allowDecimals={false} />
          <R.Tooltip
            cursor={{ fill: 'var(--muted)' }}
            formatter={(value) => [`${String(value)}회`, '복습']}
          />
          <R.Bar
            dataKey="count"
            fill="currentColor"
            radius={[3, 3, 0, 0]}
            maxBarSize={56}
            isAnimationActive={false}
          />
        </R.BarChart>
      </R.ResponsiveContainer>
    </div>
  );
}

// How well reviews were kept in the picked period (#52), from GET /api/stats/reviews (#46): the
// completion rate as a headline, and the scheduled, completed and late rounds as bars. A sentence
// gives the same numbers to those who cannot see the chart.
export function ReviewRateChart({ period }: { period: StatPeriod }) {
  // Kept per period, so a slow answer for another period never replaces or hides this one's.
  const [loaded, setLoaded] = useState<Partial<Record<StatPeriod, ReviewStats>>>({});
  const [loadError, setLoadError] = useState<{ period: StatPeriod; message: string }>();

  useEffect(() => {
    let current = true;
    requestJson<ReviewStats>(`/api/stats/reviews?period=${period}`)
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

  return (
    <section className="card study-chart review-chart" aria-labelledby="review-chart-heading">
      <h2 id="review-chart-heading">복습 완료율</h2>
      {error ? (
        <p role="alert" className="error">
          복습 통계를 불러오지 못했습니다: {error}
        </p>
      ) : !stats ? (
        <p role="status" className="status">
          불러오는 중…
        </p>
      ) : stats.completionRate === null ? (
        <p className="status">{periodLabels[period]}에는 예정된 복습이 없습니다</p>
      ) : (
        <>
          <p className="metric-value">{stats.completionRate}%</p>
          <p className="status">
            {periodLabels[period]} 예정 {stats.scheduled}회 중 {stats.completed}회 완료, 지연{' '}
            {stats.delayed}회입니다. 지연은 늦게 완료했거나 지났는데 아직 완료하지 않은 회차입니다.
          </p>
          <ReviewBars stats={stats} />
        </>
      )}
    </section>
  );
}
