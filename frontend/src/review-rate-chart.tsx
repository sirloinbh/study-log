import React, { useEffect, useState } from 'react';

import { type RequestError, requestJson } from './api';
import { Loading } from './loading';
import { periodLabels, reviewBars, type ReviewStats, type StatPeriod } from './study-stats';
import { useRecharts } from './use-recharts';

// A component of its own so the chart library is loaded only once there is something to draw.
function ReviewBars({ stats }: { stats: ReviewStats }) {
  const { charts: R, chartError } = useRecharts();
  if (chartError)
    return (
      <p role="alert" className="error">
        Could not load the chart: {chartError}
      </p>
    );
  if (!R) return <Loading label="Loading the chart" kind="text" />;
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
            formatter={(value) => [`${String(value)}`, 'Reviews']}
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
      <h2 id="review-chart-heading">Review completion rate</h2>
      {error ? (
        <p role="alert" className="error">
          Could not load the review stats: {error}
        </p>
      ) : !stats ? (
        <Loading label="Loading the review stats" kind="text" />
      ) : stats.completionRate === null ? (
        <p className="status">No reviews were scheduled for {periodLabels[period].toLowerCase()}</p>
      ) : (
        <>
          <p className="metric-value">{stats.completionRate}%</p>
          <p className="status">
            {periodLabels[period]}: {stats.completed} of {stats.scheduled} scheduled reviews
            completed, {stats.delayed} delayed. Delayed means completed late, or past due and not
            yet completed.
          </p>
          <ReviewBars stats={stats} />
        </>
      )}
    </section>
  );
}
