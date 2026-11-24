import React, { useState } from 'react';

import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import type { RequestError } from './lib/api';
import { apiKey, useApiMutation, useApiQuery } from './lib/query';
import { ButtonSpinner, Loading } from './loading';
import { plural } from './plural';
import { formatMinutes } from './study-logs-data';

type Goal = {
  weekStart: string;
  weekEnd: string;
  goalMinutes: number | null;
  goalSince: string | null;
  studiedMinutes: number;
  achievementRate: number | null;
  streakDays: number;
  studiedToday: boolean;
};

const goalPath = '/api/stats/goal';

// The goal is typed in hours; the server keeps whole minutes (1 to 10080).
const hoursText = (minutes: number | null) =>
  minutes === null ? '' : String(Math.round((minutes / 60) * 100) / 100);

// Weekly goal (#361): this week's goal (Sunday to Saturday), how much of it is done, and the streak
// of study days. Setting a goal applies from this week on, until it is changed.
export function StudyGoal() {
  const query = useApiQuery<Goal>(apiKey(goalPath), goalPath, { staleTime: 0 });
  const goal = query.data;
  const [typed, setTyped] = useState<string>();
  const [notice, setNotice] = useState<{ kind: 'status' | 'alert'; text: string }>();
  const save = useApiMutation<unknown, number>(
    (minutes) => ({
      path: goalPath,
      method: 'PUT',
      body: { minutes },
    }),
    { invalidate: [apiKey(goalPath)] },
  );

  const value = typed ?? hoursText(goal?.goalMinutes ?? null);
  const minutes = Math.round(Number(value) * 60);
  const valid = value.trim() !== '' && Number.isFinite(minutes) && minutes >= 1 && minutes <= 10080;

  const submit = async (event: { preventDefault(): void }) => {
    event.preventDefault();
    if (!valid) return;
    setNotice(undefined);
    try {
      await save.mutateAsync(minutes);
      setTyped(undefined);
      setNotice({ kind: 'status', text: 'Saved the weekly goal' });
    } catch (error) {
      setNotice({ kind: 'alert', text: (error as RequestError).message });
    }
  };

  const percent = goal?.achievementRate ?? 0;
  return (
    <section className="card" aria-label="Weekly goal">
      <h2>Weekly goal</h2>
      {query.isError && !goal ? (
        <p role="alert" className="error">
          Could not load the weekly goal: {query.error?.message}
        </p>
      ) : !goal ? (
        <Loading label="Loading the weekly goal" kind="text" />
      ) : (
        <>
          <p className="status m-0">
            {goal.weekStart} ~ {goal.weekEnd}
          </p>
          {goal.goalMinutes === null ? (
            <p className="status">No goal yet. Set one to see how much of it is done.</p>
          ) : (
            <>
              <p className="m-0 mt-2 text-[26px] font-semibold" data-goal-rate>
                {goal.achievementRate}%
              </p>
              <p className="status m-0 mb-2">
                {formatMinutes(goal.studiedMinutes)} of {formatMinutes(goal.goalMinutes)} this week
              </p>
              <div
                role="progressbar"
                aria-label="Weekly goal progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(100, percent)}
                className="h-2 overflow-hidden rounded-[4px] bg-muted"
              >
                <div
                  className="h-full bg-primary"
                  style={{ width: `${Math.min(100, percent)}%` }}
                />
              </div>
            </>
          )}
          <p className="m-0 mt-3" data-streak>
            Study streak: <strong>{plural(goal.streakDays, 'day')}</strong>
            {goal.streakDays > 0 && !goal.studiedToday && (
              <span className="status"> · study today to keep it</span>
            )}
          </p>
          <form
            className="mt-4 flex flex-wrap items-end gap-3"
            onSubmit={(event) => void submit(event)}
          >
            <label className="grid gap-1.5 text-[13px] font-medium">
              Goal for this week (hours)
              <Input
                type="number"
                inputMode="decimal"
                min={0.02}
                max={168}
                step="any"
                value={value}
                disabled={save.isPending}
                onChange={(event) => {
                  setNotice(undefined);
                  setTyped(event.target.value);
                }}
              />
            </label>
            <Button type="submit" disabled={save.isPending || !valid}>
              <ButtonSpinner when={save.isPending} />
              {goal.goalMinutes === null ? 'Set goal' : 'Change goal'}
            </Button>
          </form>
          <p role="status" className="status">
            {notice?.kind === 'status' ? notice.text : ''}
          </p>
          {notice?.kind === 'alert' && (
            <p role="alert" className="error">
              {notice.text}
            </p>
          )}
        </>
      )}
    </section>
  );
}
