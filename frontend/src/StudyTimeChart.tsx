import React, { useEffect, useState } from 'react';

import { formatMinutes } from './study-logs';
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

type Recharts = typeof import('recharts');
// Recharts is loaded on first use, so the rest of the app does not carry it; kept once loaded.
let loadedRecharts: Recharts | undefined;

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
  const [charts, setCharts] = useState<Recharts | undefined>(() => loadedRecharts);
  const [chartError, setChartError] = useState<string>();
  useEffect(() => {
    if (charts) return;
    let current = true;
    import('recharts')
      .then((module) => {
        loadedRecharts = module;
        if (current) setCharts(module);
      })
      .catch((error: Error) => {
        if (current) setChartError(error.message);
      });
    return () => {
      current = false;
    };
  }, [charts]);

  const unit = picked[stats.period] ?? defaultChartUnit[stats.period];
  const bars = chartBars(stats, unit);
  const busiest = busiestBar(bars);
  const [noun, topic] = { day: ['날', '날은'], week: ['주', '주는'], month: ['달', '달은'] }[unit];
  const R = charts;

  return (
    <section className="card study-chart" aria-labelledby="study-chart-heading">
      <div className="chart-head">
        <h2 id="study-chart-heading">학습 시간 추이</h2>
        <div className="period-filter" role="group" aria-label="그래프 단위">
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
        <p className="status">이 기간에는 학습 기록이 없습니다</p>
      ) : (
        <>
          <p className="status">
            {bars.length}개 {noun} 중 가장 많이 공부한 {topic} {busiest.label}(
            {formatMinutes(busiest.minutes)})입니다.
          </p>
          {chartError ? (
            <p role="alert" className="error">
              그래프를 불러오지 못했습니다: {chartError}
            </p>
          ) : !R ? (
            <p className="status">그래프를 불러오는 중…</p>
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
                      '학습 시간',
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
