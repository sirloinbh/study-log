import React from 'react';

import { Button } from './components/ui/button';
import { busiestFinished, finishedBars, finishedLabel, type FinishedStats } from './finished-stats';
import { Loading } from './loading';
import {
  type ChartUnit,
  chartUnitLabels,
  chartUnits,
  defaultChartUnit,
  type StatPeriod,
} from './study-stats';
import { useRecharts } from './use-recharts';

// Chapters and sections finished over the picked period as stacked bars by day, week or month
// (#481). The unit starts at what suits the period; the units picked per period are kept by the
// dashboard, which stays mounted while another period loads. A sentence names the busiest bar for
// those who cannot see the chart.
export function FinishedChart({
  stats,
  picked,
  onPick,
}: {
  stats: FinishedStats;
  picked: Partial<Record<StatPeriod, ChartUnit>>;
  onPick: (period: StatPeriod, unit: ChartUnit) => void;
}) {
  const { charts: R, chartError } = useRecharts();

  const unit = picked[stats.period] ?? defaultChartUnit[stats.period];
  const bars = finishedBars(stats, unit);
  const busiest = busiestFinished(bars);
  const [noun, topic] = {
    day: ['days', 'day'],
    week: ['weeks', 'week'],
    month: ['months', 'month'],
  }[unit];

  return (
    <section className="card grid min-w-0 gap-2.5" aria-labelledby="finished-chart-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="finished-chart-heading" className="m-0">
          Finished trend
        </h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Chart unit">
          {chartUnits.map((key) => (
            <Button
              key={key}
              type="button"
              variant={key === unit ? 'default' : 'outline'}
              aria-pressed={key === unit}
              onClick={() => onPick(stats.period, key)}
            >
              {chartUnitLabels[key]}
            </Button>
          ))}
        </div>
      </div>
      {!busiest ? (
        <p className="status">No chapters or sections were finished in this period</p>
      ) : (
        <>
          <p className="status">
            Most finished in a {topic} of {bars.length} {bars.length === 1 ? topic : noun}:{' '}
            {busiest.label} ({finishedLabel(busiest)}).
          </p>
          {chartError ? (
            <p role="alert" className="error">
              Could not load the chart: {chartError}
            </p>
          ) : !R ? (
            <Loading label="Loading the chart" kind="text" />
          ) : (
            <div
              className="min-w-0 text-primary [&_.recharts-cartesian-axis-tick-value]:fill-muted-foreground"
              aria-hidden="true"
            >
              <R.ResponsiveContainer width="100%" height={240}>
                <R.BarChart
                  accessibilityLayer={false}
                  data={bars}
                  margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
                >
                  <R.CartesianGrid vertical={false} stroke="var(--border)" />
                  <R.XAxis dataKey="label" tickLine={false} minTickGap={12} fontSize={13} />
                  <R.YAxis allowDecimals={false} tickLine={false} fontSize={13} />
                  <R.Tooltip cursor={{ fill: 'var(--muted)' }} />
                  <R.Bar
                    dataKey="chapters"
                    name="Chapters"
                    stackId="finished"
                    fill="currentColor"
                    maxBarSize={40}
                  />
                  <R.Bar
                    dataKey="sections"
                    name="Sections"
                    stackId="finished"
                    fill="var(--ring)"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={40}
                  />
                </R.BarChart>
              </R.ResponsiveContainer>
              <ul
                className="m-0 mt-2 flex list-none gap-4 p-0 text-[13px] text-muted-foreground"
                aria-label="Bar colours"
              >
                <li className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-[2px] bg-primary" /> Chapters
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-[2px] bg-ring" /> Sections
                </li>
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
