import React from 'react';

import { Loading } from './loading';
import { formatMinutes } from './study-logs-data';
import {
  busiestBar,
  chartBars,
  type ChartUnit,
  chartUnitLabels,
  chartUnits,
  defaultChartUnit,
  type StatPeriod,
  type StudyTimeStats,
} from './study-stats';
import { useRecharts } from './use-recharts';

// Study time over the picked period as bars by day, week or month (#49). The unit starts at what
// suits the period; the units picked per period are kept by the dashboard, which stays mounted
// while another period loads. A sentence names the busiest bar for those who cannot see the chart.
export function StudyTimeChart({
  stats,
  picked,
  onPick,
}: {
  stats: StudyTimeStats;
  picked: Partial<Record<StatPeriod, ChartUnit>>;
  onPick: (period: StatPeriod, unit: ChartUnit) => void;
}) {
  const { charts: R, chartError } = useRecharts();

  const unit = picked[stats.period] ?? defaultChartUnit[stats.period];
  const bars = chartBars(stats, unit);
  const busiest = busiestBar(bars);
  const [noun, topic] = {
    day: ['days', 'day'],
    week: ['weeks', 'week'],
    month: ['months', 'month'],
  }[unit];

  return (
    <section className="card study-chart" aria-labelledby="study-chart-heading">
      <div className="chart-head">
        <h2 id="study-chart-heading">Study time trend</h2>
        <div className="period-filter" role="group" aria-label="Chart unit">
          {chartUnits.map((key) => (
            <button
              key={key}
              type="button"
              className={key === unit ? 'primary' : 'secondary'}
              aria-pressed={key === unit}
              onClick={() => onPick(stats.period, key)}
            >
              {chartUnitLabels[key]}
            </button>
          ))}
        </div>
      </div>
      {!busiest ? (
        <p className="status">There are no study logs in this period</p>
      ) : (
        <>
          <p className="status">
            Busiest {topic} of {bars.length} {bars.length === 1 ? topic : noun}: {busiest.label} (
            {formatMinutes(busiest.minutes)}).
          </p>
          {chartError ? (
            <p role="alert" className="error">
              Could not load the chart: {chartError}
            </p>
          ) : !R ? (
            <Loading label="Loading the chart" kind="text" />
          ) : (
            <div className="chart-box" aria-hidden="true">
              <R.ResponsiveContainer width="100%" height={240}>
                <R.BarChart data={bars} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <R.CartesianGrid vertical={false} stroke="var(--border)" />
                  <R.XAxis dataKey="label" tickLine={false} minTickGap={12} fontSize={11} />
                  <R.YAxis allowDecimals={false} unit="h" tickLine={false} fontSize={11} />
                  <R.Tooltip
                    cursor={{ fill: 'var(--muted)' }}
                    formatter={(_value, _name, item) => [
                      formatMinutes((item.payload as { minutes: number }).minutes),
                      'Study time',
                    ]}
                  />
                  <R.Bar
                    dataKey="hours"
                    fill="currentColor"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={40}
                  />
                </R.BarChart>
              </R.ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </section>
  );
}
