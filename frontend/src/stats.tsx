import React, { useState } from 'react';

import { Button } from './components/ui/button';
import { NativeSelect } from './components/ui/native-select';
import { FinishedChart } from './finished-chart';
import { finishedPath, type FinishedStats, perDay } from './finished-stats';
import { Heatmap } from './heatmap';
import { plural } from './lib/format';
import { apiKey, useApiQuery } from './lib/query';
import { Loading } from './loading';
import { ReviewRateChart } from './review-rate-chart';
import { StudyGoal } from './study-goal';
import { type ChartUnit, periodLabels, type StatPeriod, statPeriods } from './study-stats';
import type { Textbook } from './textbook';
import { TextbookStats } from './textbook-stats';

// The dashboard (#48, #481): metric cards for the chapters and sections finished so far, today,
// the picked period and the daily average, from GET /api/stats/finished-contents (#480), the
// period's chart, its review completion (#52) and the last year's heatmap (#50). The textbook
// filter (#180) narrows the cards and the chart; reviews and the heatmap depend on it not. Study
// time shows only in the daily goal card (#479).
export function Stats() {
  const [period, setPeriod] = useState<StatPeriod>('week');
  // '' for every log, or one textbook's (#180). Without the list there is only "All".
  const [textbookId, setTextbookId] = useState('');
  const textbooksQuery = useApiQuery<{ textbooks: Textbook[] }>(
    apiKey('/api/textbooks'),
    '/api/textbooks',
  );
  const textbooks = textbooksQuery.data?.textbooks;
  const textbooksFailed = textbooksQuery.isError;
  // The chart unit picked for each period (#49).
  const [chartUnits, setChartUnits] = useState<Partial<Record<StatPeriod, ChartUnit>>>({});

  const path = finishedPath(period, textbookId);
  const bookTitle = textbooks?.find((book) => String(book.id) === textbookId)?.title;
  // One cached answer per pick, so a slow answer for another pick never replaces or hides this one's.
  const query = useApiQuery<FinishedStats>(apiKey(path), path);
  const stats = query.data;
  const error = query.error?.message;
  const label = periodLabels[period];

  return (
    <div className="stats">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Period">
        {statPeriods.map((key) => (
          <Button
            key={key}
            type="button"
            variant={key === period ? 'default' : 'outline'}
            aria-pressed={key === period}
            onClick={() => setPeriod(key)}
          >
            {periodLabels[key]}
          </Button>
        ))}
      </div>
      {/* Named apart from the textbook filter of "Textbooks and schedules" below, which covers only that card. */}
      <label className="mb-4 grid max-w-80 grid-cols-[minmax(0,1fr)] gap-1.5 text-[13px] font-medium">
        Textbook
        <NativeSelect
          aria-label="Finished counts textbook"
          className="w-full min-w-0"
          value={textbookId}
          onChange={(event) => setTextbookId(event.target.value)}
        >
          <option value="">All</option>
          {textbooks?.map((book) => (
            <option key={book.id} value={book.id}>
              {book.title}
            </option>
          ))}
        </NativeSelect>
      </label>
      {textbooksFailed && (
        <p className="status">
          Could not load the textbook list, so the view cannot be narrowed by textbook
        </p>
      )}
      {error ? (
        <p role="alert" className="error">
          Could not load the stats: {error}
        </p>
      ) : !stats ? (
        <Loading label="Loading the stats" kind="cards" />
      ) : (
        <section
          className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-4"
          aria-label="Finished metrics"
        >
          <article className="card" data-metric>
            <h2 className="m-0 mb-2 text-[13px] font-medium text-muted-foreground">
              Finished so far
            </h2>
            <p
              className="m-0 mb-1.5 text-[20px] font-semibold whitespace-nowrap sm:text-[26px]"
              data-metric-value
            >
              {plural(stats.cumulativeChapters, 'chapter')}
            </p>
            <p className="status m-0 text-[13px] [word-break:keep-all]">
              {plural(stats.cumulativeSections, 'section')}
            </p>
            <p className="status m-0 text-[13px] [word-break:keep-all]">
              Of {plural(stats.totalChapters, 'chapter')} and{' '}
              {plural(stats.totalSections, 'section')}
              {bookTitle && ` · ${bookTitle}`}
            </p>
          </article>
          <article className="card" data-metric>
            <h2 className="m-0 mb-2 text-[13px] font-medium text-muted-foreground">Today</h2>
            <p
              className="m-0 mb-1.5 text-[20px] font-semibold whitespace-nowrap sm:text-[26px]"
              data-metric-value
            >
              {plural(stats.todayChapters, 'chapter')}
            </p>
            <p className="status m-0 text-[13px] [word-break:keep-all]">
              {plural(stats.todaySections, 'section')}
            </p>
            <p className="status m-0 text-[13px] [word-break:keep-all]">{stats.to}</p>
          </article>
          <article className="card" data-metric>
            <h2 className="m-0 mb-2 text-[13px] font-medium text-muted-foreground">{label}</h2>
            <p
              className="m-0 mb-1.5 text-[20px] font-semibold whitespace-nowrap sm:text-[26px]"
              data-metric-value
            >
              {plural(stats.chapters, 'chapter')}
            </p>
            <p className="status m-0 text-[13px] [word-break:keep-all]">
              {plural(stats.sections, 'section')}
            </p>
            {/* Breaks only around "~", never inside a date. */}
            <p className="status m-0 text-[13px] [word-break:keep-all]">
              <span className="whitespace-nowrap">{stats.from}</span> ~{' '}
              <span className="whitespace-nowrap">{stats.to}</span>
            </p>
          </article>
          <article className="card" data-metric>
            <h2 className="m-0 mb-2 text-[13px] font-medium text-muted-foreground">
              Daily average
            </h2>
            <p
              className="m-0 mb-1.5 text-[20px] font-semibold whitespace-nowrap sm:text-[26px]"
              data-metric-value
            >
              {perDay(stats.chapters + stats.sections, stats.days)} a day
            </p>
            <p className="status m-0 text-[13px] [word-break:keep-all]">
              Chapters and sections together
            </p>
            <p className="status m-0 text-[13px] [word-break:keep-all]">Based on {label}</p>
          </article>
        </section>
      )}
      <StudyGoal />
      {stats && !error && (
        <FinishedChart
          stats={stats}
          picked={chartUnits}
          onPick={(key, unit) => setChartUnits((all) => ({ ...all, [key]: unit }))}
        />
      )}
      <ReviewRateChart period={period} />
      <TextbookStats />
      <Heatmap />
    </div>
  );
}
