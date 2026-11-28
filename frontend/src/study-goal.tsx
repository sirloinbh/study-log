import React from 'react';

import { apiKey, useApiQuery } from './lib/query';
import { Loading } from './loading';
import { plural } from './plural';
import { formatMinutes } from './study-logs-data';

type Goal = {
  date: string;
  goalMinutes: number;
  studiedMinutes: number;
  achievementRate: number;
  streakDays: number;
  studiedToday: boolean;
};

const goalPath = '/api/stats/goal';

// Daily goal (#479): one fixed goal of 2 hours for every day, today's study against it, and the
// streak of study days. There is no goal form; the goal is the same on weekdays, weekends and holidays.
export function StudyGoal() {
  const query = useApiQuery<Goal>(apiKey(goalPath), goalPath, { staleTime: 0 });
  const goal = query.data;
  const percent = goal?.achievementRate ?? 0;
  return (
    <section className="card" aria-label="Daily goal">
      <h2>Daily goal</h2>
      {query.isError && !goal ? (
        <p role="alert" className="error">
          Could not load the daily goal: {query.error?.message}
        </p>
      ) : !goal ? (
        <Loading label="Loading the daily goal" kind="text" />
      ) : (
        <>
          <p className="status m-0">{goal.date}</p>
          <p className="m-0 mt-2 text-[26px] font-semibold" data-goal-rate>
            {goal.achievementRate}%
          </p>
          <p className="status m-0 mb-2">
            {formatMinutes(goal.studiedMinutes)} of {formatMinutes(goal.goalMinutes)} today
          </p>
          <div
            role="progressbar"
            aria-label="Daily goal progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, percent)}
            className="h-2 overflow-hidden rounded-[4px] bg-muted"
          >
            <div className="h-full bg-primary" style={{ width: `${Math.min(100, percent)}%` }} />
          </div>
          <p className="m-0 mt-3" data-streak>
            Study streak: <strong>{plural(goal.streakDays, 'day')}</strong>
            {goal.streakDays > 0 && !goal.studiedToday && (
              <span className="status"> · study today to keep it</span>
            )}
          </p>
        </>
      )}
    </section>
  );
}
