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
      pool.query("DELETE FROM study_logs WHERE study_date BETWEEN '2096-01-01' AND '2096-12-31'");
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
        await add('2096-05-13', '10:00', '10:20', 'done'); // 20, Sunday: last week
        await add('2096-05-01', '07:00', '07:45', 'stopped'); // 45
        await add('2096-03-10', '23:00', '01:00', 'done'); // 120, past midnight
        await add('2096-01-05', '09:00', '09:30', 'done'); // 30, before the 3 months
        await add('2096-05-20', '09:00', '10:40', 'done'); // 100, after today

        const week = await stats('week');
        assert.deepEqual(
          [week.from, week.to, week.totalMinutes, week.todayMinutes, week.days],
          ['2096-05-14', today, 150, 90, 3],
        );
        assert.deepEqual(
          week.daily.map((day) => day.minutes),
          [0, 60, 90],
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
          { weekStart: '2096-04-30', minutes: 45 },
          { weekStart: '2096-05-07', minutes: 20 },
          { weekStart: '2096-05-14', minutes: 150 },
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
        // Planned and future logs never count.
        assert.equal(all.cumulativeMinutes, baseline + 365);
        assert.equal(all.cumulativeMinutes, week.cumulativeMinutes);
        assert.equal(all.to, today);
        assert.equal(all.totalMinutes, all.cumulativeMinutes);

        // Without a period it is this week; an empty one is refused like any unknown one.
        assert.equal(((await call('/api/stats/study-time')).data as Stats).period, 'week');
        assert.equal((await call('/api/stats/study-time?period=')).status, 400);
      },
      { today: () => today },
    );
  },
);
