import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import { holdExactTotalsLock, withApi } from './helpers.js';

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
    // The all-time total below also counts rows of the other early-date test.
    await holdExactTotalsLock(url, t, async () => {
      await cleanup();
      await pool.end();
    });
    await cleanup();
    const today = '2096-05-16';

    await withApi(
      pool,
      async (call) => {
        const stats = async (period: string) =>
          (await call(`/api/stats/study-time?period=${period}`)).data as Stats;
        // Whatever the shared DB already holds before 2096 counts toward the all-time total.
        const baseline = (await stats('all')).cumulativeMinutes;
        const baselineOf = async (type: string) =>
          ((await call(`/api/stats/study-time?period=all&type=${type}`)).data as Stats)
            .cumulativeMinutes;
        const baselineReview = await baselineOf('review');
        const baselineNew = await baselineOf('new');
        assert.equal(baselineReview + baselineNew, baseline);

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

        // The study type filter (#52): logs without a type are new.
        await call('/api/study-logs', {
          method: 'POST',
          body: {
            studyDate: today,
            startTime: '15:00',
            endTime: '15:40',
            status: 'done',
            studyType: 'review',
          },
        });
        const typed = async (type: string) =>
          (await call(`/api/stats/study-time?period=week&type=${type}`)).data as Stats & {
            type: string;
          };
        const reviewOnly = await typed('review');
        assert.deepEqual(
          [reviewOnly.type, reviewOnly.totalMinutes, reviewOnly.todayMinutes, reviewOnly.studyDays],
          ['review', 40, 40, 1],
        );
        assert.equal(reviewOnly.cumulativeMinutes, baselineReview + 40);
        assert.deepEqual(
          reviewOnly.daily.map((day) => day.minutes),
          [0, 0, 0, 40],
        );
        const newOnly = await typed('new');
        assert.equal(newOnly.totalMinutes, 170);
        assert.equal(newOnly.cumulativeMinutes, baselineNew + 375);
        const everything = await typed('all');
        assert.deepEqual(
          [everything.type, everything.totalMinutes, everything.cumulativeMinutes],
          ['all', 210, baseline + 415],
        );
        // The other periods narrow the same way.
        for (const [period, minutes] of [
          ['month', 40],
          ['3months', 40],
          ['all', 40],
        ] as const) {
          const narrowed = (await call(`/api/stats/study-time?period=${period}&type=review`))
            .data as Stats;
          assert.equal(narrowed.totalMinutes >= minutes, true, period);
          assert.equal(narrowed.daily.at(-1)?.minutes, 40, period);
        }
        // The heatmap has no filter: it keeps counting every kind of study.
        const heatAfter = (await call('/api/stats/heatmap')).data as typeof heat;
        assert.equal(heatAfter.daily.find((day) => day.date === today)?.minutes, 130);
        assert.equal(((await call('/api/stats/study-time')).data as { type: string }).type, 'all');
        const refused = await call('/api/stats/study-time?type=exam');
        assert.equal(refused.status, 400);
        assert.match(String(refused.data.error), /학습 유형은 전체, 신규, 복습 중에서 고르세요/);

        // Without a period it is this week; an empty one is refused like any unknown one.
        assert.equal(((await call('/api/stats/study-time')).data as Stats).period, 'week');
        assert.equal((await call('/api/stats/study-time?period=')).status, 400);
      },
      { today: () => today },
    );
  },
);

// #180. One textbook's logs only: dates in 2095, which no other test file uses, and a book of its
// own, so the all-time total of the book holds only what is added here.
test('study time can be narrowed to one textbook', { skip: !url }, async (t) => {
  const pool = new Pool({ connectionString: url });
  const books: number[] = [];
  const cleanup = async () => {
    await pool.query(
      "DELETE FROM study_logs WHERE study_date BETWEEN '2095-01-01' AND '2095-12-31'",
    );
    if (books.length) await pool.query('DELETE FROM textbooks WHERE id = ANY($1)', [books]);
  };
  await holdExactTotalsLock(url, t, async () => {
    await cleanup();
    await pool.end();
  });
  await cleanup();
  const today = '2095-08-17';

  await withApi(
    pool,
    async (call) => {
      const book = async (title: string) => {
        const made = await call('/api/textbooks', { method: 'POST', body: { title } });
        const id = (made.data.textbook as { id: number }).id;
        books.push(id);
        return id;
      };
      const first = await book('필터 교재');
      const second = await book('다른 교재');
      const empty = await book('기록 없는 교재');
      const add = (studyDate: string, startTime: string, endTime: string, extra: object) =>
        call('/api/study-logs', {
          method: 'POST',
          body: { studyDate, startTime, endTime, status: 'done', ...extra },
        });
      await add(today, '09:00', '10:00', { textbookId: first }); // 60
      await add(today, '11:00', '11:30', { textbookId: first, studyType: 'review' }); // 30
      await add('2095-08-15', '09:00', '09:20', { textbookId: first }); // 20, this week
      await add(today, '13:00', '13:45', { textbookId: second }); // 45
      await add(today, '15:00', '15:10', {}); // 10, no textbook
      await add('2095-08-20', '09:00', '10:00', { textbookId: first }); // after today

      type Narrowed = Stats & { textbookId: number | null; type: string };
      const stats = async (query: string) => {
        const answer = await call(`/api/stats/study-time?${query}`);
        assert.equal(answer.status, 200, JSON.stringify(answer.data));
        return answer.data as Narrowed;
      };
      const one = await stats(`period=week&textbookId=${first}`);
      assert.deepEqual(
        [one.textbookId, one.totalMinutes, one.todayMinutes, one.cumulativeMinutes, one.studyDays],
        [first, 110, 90, 110, 2],
      );
      assert.equal(one.daily.at(-1)?.minutes, 90);
      // Together with the study type.
      const review = await stats(`period=week&type=review&textbookId=${first}`);
      assert.deepEqual([review.totalMinutes, review.cumulativeMinutes], [30, 30]);
      assert.equal((await stats(`period=week&textbookId=${second}`)).totalMinutes, 45);
      // "All" starts at the book's first log, not at anyone's.
      const all = await stats(`period=all&textbookId=${first}`);
      assert.deepEqual([all.from, all.days, all.totalMinutes], ['2095-08-15', 3, 110]);
      // A book with no logs is zeros, from today.
      const none = await stats(`period=all&textbookId=${empty}`);
      assert.deepEqual(
        [
          none.totalMinutes,
          none.cumulativeMinutes,
          none.from,
          none.days,
          none.averageMinutesPerDay,
        ],
        [0, 0, today, 1, 0],
      );
      // Without one, every log counts and the answer says so.
      const everything = await stats('period=week');
      assert.equal(everything.textbookId, null);
      assert.equal(everything.daily.at(-1)?.minutes, 60 + 30 + 45 + 10);

      const missing = await call('/api/stats/study-time?textbookId=999999999999');
      assert.equal(missing.status, 404);
      assert.match(String(missing.data.error), /교재를 찾을 수 없습니다/);
      for (const wrong of ['0', 'abc', '1.5', '']) {
        const refused = await call(`/api/stats/study-time?textbookId=${wrong}`);
        assert.equal(refused.status, 400, wrong);
        assert.match(String(refused.data.error), /교재 ID가 올바르지 않습니다/);
      }
    },
    { today: () => today },
  );
});
