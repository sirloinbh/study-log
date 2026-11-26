import { addDays, weekStart } from './stats.js';

// How far a goal list is (#426). An item is solved once its problem has a solved attempt, whenever
// that attempt was made: a problem solved before the list was imported counts at once, and a later
// failed attempt does not undo it. An unsolved item is late when its due day (its own target date,
// else the list's) has passed.
export type ProgressItem = {
  position: number;
  topic: string;
  // YYYY-MM-DD of the latest solved attempt, or null.
  solvedDate: string | null;
  // The item's own target date, else the list's, or null.
  dueDate: string | null;
};
export type ItemState = 'solved' | 'late' | 'left';

export function stateOf(
  item: Pick<ProgressItem, 'solvedDate' | 'dueDate'>,
  today: string,
): ItemState {
  if (item.solvedDate !== null) return 'solved';
  return item.dueDate !== null && item.dueDate < today ? 'late' : 'left';
}

export type Progress = {
  total: number;
  solved: number;
  late: number;
  // Items due this week (Sunday to Saturday, like the other weekly figures) and how many of them are solved.
  weekPlanned: number;
  weekSolved: number;
};

export function progressOf(
  items: readonly Pick<ProgressItem, 'solvedDate' | 'dueDate'>[],
  today: string,
): Progress {
  const from = weekStart(today);
  const to = addDays(from, 6);
  const progress: Progress = {
    total: items.length,
    solved: 0,
    late: 0,
    weekPlanned: 0,
    weekSolved: 0,
  };
  for (const item of items) {
    const state = stateOf(item, today);
    if (state === 'solved') progress.solved += 1;
    if (state === 'late') progress.late += 1;
    if (item.dueDate !== null && item.dueDate >= from && item.dueDate <= to) {
      progress.weekPlanned += 1;
      if (state === 'solved') progress.weekSolved += 1;
    }
  }
  return progress;
}
