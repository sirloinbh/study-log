import React from 'react';
import { useSearchParams } from 'react-router';

import { SegmentedControl, type SegmentOption } from './components/ui/segmented-control';
import { Stats } from './stats';
import { TwelveWeekView } from './twelve-week-view';
import { WeekView } from './week-view';

// The Dashboard holds three views behind one choice (#504): the overview (period cards, charts,
// textbooks), one Week, and the last 12 weeks. The view is kept in the address (?view=), so a
// reload or a shared link opens the same view; without it the overview opens.
const views = ['overview', 'week', 'twelve-weeks'] as const;
export type DashboardView = (typeof views)[number];

const options: readonly SegmentOption<DashboardView>[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'week', label: 'Week' },
  { value: 'twelve-weeks', label: '12 weeks' },
];

const viewOf = (value: string | null): DashboardView =>
  views.find((view) => view === value) ?? 'overview';

export function Dashboard({ today }: { today: string }) {
  const [params, setParams] = useSearchParams();
  const view = viewOf(params.get('view'));

  return (
    <>
      <SegmentedControl
        label="Dashboard view"
        options={options}
        value={view}
        onValueChange={(next) => setParams(next === 'overview' ? {} : { view: next })}
        className="mb-4"
      />
      {view === 'week' ? (
        <WeekView today={today} />
      ) : view === 'twelve-weeks' ? (
        <TwelveWeekView today={today} />
      ) : (
        <Stats />
      )}
    </>
  );
}
