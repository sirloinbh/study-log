import { useSearchParams } from 'react-router';

import { SegmentedControl } from './components/ui/segmented-control';
import { Stats } from './stats';
import { TwelveWeekView } from './twelve-week-view';
import { WeekView } from './week-view';

// The dashboard (#504): the summary, the week view and the 12-week view behind one choice kept in
// the address (?view=week or ?view=12weeks), so the old Week and 12 weeks pages redirect here.
const dashboardViews = [
  { value: 'summary', label: 'Summary' },
  { value: 'week', label: 'Week' },
  { value: '12weeks', label: '12 weeks' },
] as const;
type DashboardView = (typeof dashboardViews)[number]['value'];

export function DashboardPage({ today }: { today: string }) {
  const [params, setParams] = useSearchParams();
  const asked = params.get('view');
  const view: DashboardView = dashboardViews.some((v) => v.value === asked)
    ? (asked as DashboardView)
    : 'summary';
  return (
    <div className="flex flex-col gap-6">
      <SegmentedControl
        label="Dashboard view"
        options={dashboardViews}
        value={view}
        onValueChange={(next) =>
          setParams(next === 'summary' ? {} : { view: next }, { replace: true })
        }
      />
      {view === 'week' ? (
        <WeekView today={today} />
      ) : view === '12weeks' ? (
        <TwelveWeekView today={today} />
      ) : (
        <Stats />
      )}
    </div>
  );
}
