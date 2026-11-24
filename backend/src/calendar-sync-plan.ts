// What the sync does to make Google match the app (#366): a pure comparison, so it is tested
// without a database or Google.
export type Source = 'schedule_item' | 'review' | 'exercise_review';
export type Wanted = { source: Source; sourceId: number; date: string; summary: string };
export type Mapped = Wanted & { eventId: string };

export type Plan = { create: Wanted[]; update: Mapped[]; remove: Mapped[] };

const key = (item: { source: Source; sourceId: number }) => `${item.source}:${item.sourceId}`;

export function planSync(wanted: Wanted[], mapped: Mapped[]): Plan {
  const have = new Map(mapped.map((item) => [key(item), item]));
  const want = new Set(wanted.map(key));
  const plan: Plan = { create: [], update: [], remove: [] };
  for (const item of wanted) {
    const existing = have.get(key(item));
    if (!existing) plan.create.push(item);
    else if (existing.date !== item.date || existing.summary !== item.summary)
      plan.update.push({ ...item, eventId: existing.eventId });
  }
  for (const item of mapped) if (!want.has(key(item))) plan.remove.push(item);
  return plan;
}
