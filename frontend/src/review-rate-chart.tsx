import React from 'react';

import { apiKey, useApiQuery } from './lib/query';
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
    <div
      className="min-w-0 text-primary [&_.recharts-cartesian-axis-tick-value]:fill-muted-foreground"
      aria-hidden="true"
    >
      <R.ResponsiveContainer width="100%" height={200}>
        <R.BarChart
          accessibilityLayer={false}
          data={reviewBars(stats)}
          margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
        >
          <R.CartesianGrid vertical={false} stroke="var(--border)" />
          {/* Every label, since the counts are read from them. */}
          <R.XAxis dataKey="label" interval={0} tickLine={false} fontSize={13} />
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
  // One cached answer per period, so a slow answer for another period never replaces or hides this one's.
  const query = useApiQuery<ReviewStats>(
    apiKey('/api/stats/reviews', period),
    `/api/stats/reviews?period=${period}`,
  );
  const stats = query.data;
  const error = query.error?.message;

  return (
    <section className="card grid min-w-0 gap-2.5" aria-labelledby="review-chart-heading">
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
          <p
            className="m-0 mb-1.5 text-[20px] font-semibold whitespace-nowrap sm:text-[26px]"
            data-metric-value
          >
            {stats.completionRate}%
          </p>
          <p className="status">
            {periodLabels[period]}: {stats.completed} of {stats.scheduled} scheduled reviews
            completed, {stats.delayed} delayed.
          </p>
          <ReviewBars stats={stats} />
        </>
      )}
    </section>
  );
}
