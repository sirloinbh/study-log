import { type GoalDay } from './coding';
import { apiKey, useApiQuery } from './lib/query';

// Today's algorithm goals at the top of the Algorithms page (#426, moved from the day log in #477): per goal list, what is due today, what was solved
// today and what comes next. Nothing is shown without a goal list, or while it loads or fails: the
// page does not depend on it.
export function CodingGoalDay({ date }: { date: string }) {
  const day = useApiQuery<GoalDay>(
    apiKey('/api/coding', 'goals', 'today', date),
    `/api/coding/goals/today?date=${encodeURIComponent(date)}`,
    { staleTime: 0 },
  );
  const lists = day.data?.lists ?? [];
  if (lists.length === 0) return null;
  return (
    <section className="card coding-goal-day" aria-label="Algorithm goals today">
      <h2>Algorithm goals today</h2>
      <ul className="log-list">
        {lists.map((list) => {
          const planned = list.planned.length;
          const plannedSolved = list.planned.filter((item) => item.state === 'solved').length;
          return (
            <li key={list.id}>
              <div className="log-head">
                <span>{list.name}</span>
                {planned > 0 && (
                  <span className="log-date">
                    Due today: {plannedSolved} of {planned} solved
                  </span>
                )}
              </div>
              {list.solved.length > 0 && (
                <p className="log-memo">
                  Solved today: {list.solved.map((item) => item.title).join(', ')}
                </p>
              )}
              {list.next.length > 0 && (
                <p className="log-memo">
                  Next: {list.next.map((item) => `${item.title} (${item.problemKey})`).join(', ')}
                </p>
              )}
              {planned > 0 && plannedSolved < planned && (
                <p className="log-memo">
                  Still to do today:{' '}
                  {list.planned
                    .filter((item) => item.state !== 'solved')
                    .map((item) => item.title)
                    .join(', ')}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
