import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

type Stats = {
  period: string;
  from: string;
  to: string;
  totalMinutes: number;
  todayMinutes: number;
  cumulativeMinutes: number;
  days: number;
  studyDays: number;
  averageMinutesPerDay: number;
  averageMinutesPerStudyDay: number;
  daily: { date: string; minutes: number }[];
  weekly: { weekStart: string; minutes: number }[];
  monthly: { month: string; minutes: number }[];
};

// #47. Requires a dedicated test DB with database/migrations applied. Skipped (not passed)
// without it. "Today" is 2096-05-16, a Wednesday: before every date other test files use
// (2097 and later), so their rows never fall into these periods.
test(
  'study time is summed by day, week, month and period against the real database',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    const cleanup = () =>
      pool.query(
        "DELETE FROM study_logs WHERE study_date BETWEEN '2096-01-01' AND '2096-12-31' OR study_date = '0001-01-01'",
      );
    await cleanup();
    t.after(async () => {
      await cleanup();
      await pool.end();
    });
    const today = '2096-05-16';

    await withApi(
      pool,
      async (call) => {
        const stats = async (period: string) =>
          (await call(`/api/stats/study-time?period=${period}`)).data as Stats;
        // Whatever the shared DB already holds before 2096 counts toward the all-time total.
        const baseline = (await stats('all')).cumulativeMinutes;

        const add = (studyDate: string, startTime: string, endTime: string, status: string) =>
          call('/api/study-logs', {
            method: 'POST',
            body: { studyDate, startTime, endTime, status },
          });
        await add(today, '09:00', '10:30', 'done'); // 90
        await add(today, '13:00', '13:30', 'planned'); // not studied yet
        await add('2096-05-15', '20:00', '21:00', 'in_progress'); // 60
        await add('2096-05-13', '10:00', '10:20', 'done'); // 20, Sunday: opens this week (#96)
        await add('2096-05-01', '07:00', '07:45', 'stopped'); // 45
        await add('2096-03-10', '23:00', '01:00', 'done'); // 120, past midnight
        await add('2096-01-05', '09:00', '09:30', 'done'); // 30, before the 3 months
        await add('2096-05-20', '09:00', '10:40', 'done'); // 100, after today
        await add('0001-01-01', '09:00', '09:10', 'done'); // 10, long before: only in the total

        const week = await stats('week');
        assert.deepEqual(
          [week.from, week.to, week.totalMinutes, week.todayMinutes, week.days],
          ['2096-05-13', today, 170, 90, 4],
        );
        assert.deepEqual(
          week.daily.map((day) => day.minutes),
          [20, 0, 60, 90],
        );

        const month = await stats('month');
        assert.deepEqual(
          [month.from, month.totalMinutes, month.days, month.studyDays],
          ['2096-05-01', 215, 16, 4],
        );
        // 215 / 16 days = 13.4; 215 / 4 studied days = 53.75.
        assert.equal(month.averageMinutesPerDay, 13);
        assert.equal(month.averageMinutesPerStudyDay, 54);
        assert.deepEqual(month.weekly, [
          { weekStart: '2096-04-29', minutes: 45 },
          { weekStart: '2096-05-06', minutes: 0 },
          { weekStart: '2096-05-13', minutes: 170 },
        ]);

        const months3 = await stats('3months');
        assert.deepEqual(
          [months3.from, months3.days, months3.totalMinutes],
          ['2096-02-17', 90, 335],
        );
        assert.deepEqual(months3.monthly, [
          { month: '2096-02', minutes: 0 },
          { month: '2096-03', minutes: 120 },
          { month: '2096-04', minutes: 0 },
          { month: '2096-05', minutes: 215 },
        ]);

        const all = await stats('all');
        // Planned and future logs never count; the year-1 log counts in the all-time total.
        assert.equal(all.cumulativeMinutes, baseline + 375);
        assert.equal(all.cumulativeMinutes, week.cumulativeMinutes);
        assert.equal(all.to, today);
        // But the series stops about ten years back instead of reaching year 1.
        assert.equal(all.from, '2086-05-17');
        assert.equal(all.days, 3653);
        assert.equal(all.daily.length, 3653);
        assert.equal(all.totalMinutes, 365);

        // The heatmap (#50): 53 weeks up to today, from a Sunday (#96), the same counting rules.
        const heat = (await call('/api/stats/heatmap')).data as {
          from: string;
          to: string;
          daily: { date: string; minutes: number }[];
        };
        assert.deepEqual([heat.from, heat.to], ['2095-05-15', today]);
        // 52 full weeks plus Sunday to Wednesday of this one.
        assert.equal(heat.daily.length, 52 * 7 + 4);
        const minutesOn = (date: string) => heat.daily.find((day) => day.date === date)?.minutes;
        assert.equal(minutesOn(today), 90);
        assert.equal(minutesOn('2096-03-10'), 120);
        assert.equal(minutesOn('2096-01-05'), 30);
        assert.equal(minutesOn('2096-05-20'), undefined);

        // Without a period it is this week; an empty one is refused like any unknown one.
        assert.equal(((await call('/api/stats/study-time')).data as Stats).period, 'week');
        assert.equal((await call('/api/stats/study-time?period=')).status, 400);
      },
      { today: () => today },
    );
  },
);
