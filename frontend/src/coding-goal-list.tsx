import { useState } from 'react';

import { type GoalItem, type GoalProgress, goalStateLabel, siteLabels, tierLabel } from './coding';
import { Button } from './components/ui/button';
import { NativeSelect } from './components/ui/native-select';
import { apiKey, useApiQuery } from './lib/query';
import { Loading } from './loading';

type Filter = 'all' | 'left' | 'solved' | 'late';
const filterLabels: Record<Filter, string> = {
  all: 'All',
  left: 'Left (not solved)',
  solved: 'Solved',
  late: 'Late',
};
const pageSize = 50;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

// The solved share of a list as a bar, for people and for screen readers.
export function ProgressBar({ label, progress }: { label: string; progress: GoalProgress }) {
  const percent = progress.total === 0 ? 0 : Math.round((progress.solved / progress.total) * 100);
  return (
    <div className="goal-progress">
      <div
        className="goal-bar"
        role="progressbar"
        aria-label={`${label} progress`}
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.solved}
        aria-valuetext={`${progress.solved} of ${progress.total} solved`}
      >
        <div style={{ width: `${percent}%` }} />
      </div>
      <p className="status">
        {progress.solved} of {progress.total} solved ({percent}%)
        {progress.late > 0 && `, ${progress.late} late`}
        {progress.weekPlanned > 0 &&
          `, this week ${progress.weekSolved} of ${progress.weekPlanned} due`}
      </p>
    </div>
  );
}

// One goal list (#426): the progress, filters, and the problems in order. A solved problem opens
// its attempts in the problem log.
export function CodingGoalList({
  id,
  name,
  onOpenProblem,
}: {
  id: number;
  name: string;
  onOpenProblem: (item: GoalItem) => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [topic, setTopic] = useState('');
  const [shown, setShown] = useState(pageSize);
  const detail = useApiQuery<{ progress: GoalProgress; items: GoalItem[] }>(
    apiKey('/api/coding', 'goals', id),
    `/api/coding/goals/${id}`,
    { staleTime: 0 },
  );
  if (detail.error)
    return (
      <p role="alert" className="error">
        Could not load the list: {detail.error.message}
      </p>
    );
  if (!detail.data) return <Loading label="Loading the list" />;
  const { progress, items } = detail.data;
  const topics = [...new Set(items.map((item) => item.topic).filter(Boolean))];
  const visible = items.filter(
    (item) =>
      (filter === 'all' || (filter === 'left' ? item.state !== 'solved' : item.state === filter)) &&
      (!topic || item.topic === topic),
  );
  const change = (set: () => void) => {
    set();
    setShown(pageSize);
  };

  return (
    <div className="coding-goal-list" role="region" aria-label={`${name} problems`}>
      <ProgressBar label={name} progress={progress} />
      <div className="log-form coding-filters">
        <label>
          Show
          <NativeSelect
            value={filter}
            onChange={(event) => change(() => setFilter(event.target.value as Filter))}
          >
            {(Object.keys(filterLabels) as Filter[]).map((value) => (
              <option key={value} value={value}>
                {filterLabels[value]}
              </option>
            ))}
          </NativeSelect>
        </label>
        {topics.length > 0 && (
          <label>
            Topic
            <NativeSelect
              value={topic}
              onChange={(event) => change(() => setTopic(event.target.value))}
            >
              <option value="">All topics</option>
              {topics.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </NativeSelect>
          </label>
        )}
      </div>
      {visible.length === 0 ? (
        <p className="status">No problems match</p>
      ) : (
        <ol className="log-list coding-goal-items" start={1}>
          {visible.slice(0, shown).map((item) => (
            <li key={item.id} data-state={item.state}>
              <div className="log-head">
                <span className="log-date">
                  {siteLabels[item.site]} {item.problemKey}
                </span>
                <span>{item.title}</span>
              </div>
              <p className="log-memo">
                <span className={`goal-state goal-state-${item.state}`}>
                  {goalStateLabel(item)}
                </span>
                {item.level !== null && `, ${tierLabel(item.level)}`}
                {item.topic && `, ${item.topic}`}
                {item.group && `, ${item.group}`}
                {item.attemptCount > 0 && `, ${plural(item.attemptCount, 'attempt')}`}
              </p>
              {item.problemId !== null && (
                <div className="log-actions">
                  <Button type="button" variant="outline" onClick={() => onOpenProblem(item)}>
                    Open attempts<span className="sr-only"> of {item.title}</span>
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      {visible.length > shown && (
        <Button type="button" variant="outline" onClick={() => setShown(shown + pageSize)}>
          Show more ({visible.length - shown} left)
        </Button>
      )}
    </div>
  );
}
