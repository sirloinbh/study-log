import React, { useEffect, useState } from 'react';

import { type RequestError, requestJson } from './api';
import { Heatmap } from './heatmap';
import { Loading } from './loading';
import { ReviewRateChart } from './review-rate-chart';
import { formatMinutes } from './study-logs-data';
import {
  type ChartUnit,
  periodLabels,
  type StatPeriod,
  statPeriods,
  type StatStudyType,
  statStudyTypeLabels,
  statStudyTypes,
  studyTimePath,
  type StudyTimeStats,
} from './study-stats';
import { StudyTimeChart } from './study-time-chart';
import type { Textbook } from './textbook';
import { TextbookStats } from './textbook-stats';

// Study time dashboard (#48): metric cards for the all-time total, today, the picked period and
// its daily average, from GET /api/stats/study-time (#47), the period's study time chart (#49),
// its review completion (#52) and the last year's heatmap (#50). The study type filter (#52)
// narrows the cards and the study time chart, and so does the textbook filter (#180); reviews and
// the heatmap depend on neither.
export function Stats() {
  const [period, setPeriod] = useState<StatPeriod>('week');
  const [studyType, setStudyType] = useState<StatStudyType>('all');
  // '' for every log, or one textbook's (#180). Without the list there is only "All".
  const [textbookId, setTextbookId] = useState('');
  const [textbooks, setTextbooks] = useState<Textbook[]>();
  const [textbooksFailed, setTextbooksFailed] = useState(false);
  useEffect(() => {
    let current = true;
    requestJson<{ textbooks: Textbook[] }>('/api/textbooks')
      .then((data) => current && setTextbooks(data.textbooks))
      .catch(() => current && setTextbooksFailed(true));
    return () => {
      current = false;
    };
  }, []);
  // Kept per period and type, so a slow answer for another pick never replaces or hides this one's.
  const [loaded, setLoaded] = useState<Partial<Record<string, StudyTimeStats>>>({});
  const [loadError, setLoadError] = useState<{ path: string; message: string }>();
  // The chart unit picked for each period (#49).
  const [chartUnits, setChartUnits] = useState<Partial<Record<StatPeriod, ChartUnit>>>({});

  const path = studyTimePath(period, studyType, textbookId);
  const bookTitle = textbooks?.find((book) => String(book.id) === textbookId)?.title;
  useEffect(() => {
    let current = true;
    requestJson<StudyTimeStats>(path)
      .then((data) => {
        if (!current) return;
        setLoaded((all) => ({ ...all, [path]: data }));
        setLoadError((failed) => (failed?.path === path ? undefined : failed));
      })
      .catch((error: RequestError) => {
        if (current) setLoadError({ path, message: error.message });
      });
    return () => {
      current = false;
    };
  }, [path]);

  const stats = loaded[path];
  const error = loadError?.path === path ? loadError.message : undefined;
  const label = periodLabels[period];

  return (
    <div className="stats">
      <div className="period-filter" role="group" aria-label="Period">
        {statPeriods.map((key) => (
          <button
            key={key}
            type="button"
            className={key === period ? 'primary' : 'secondary'}
            aria-pressed={key === period}
            onClick={() => setPeriod(key)}
          >
            {periodLabels[key]}
          </button>
        ))}
      </div>
      <div className="period-filter" role="group" aria-label="Study type">
        {statStudyTypes.map((key) => (
          <button
            key={key}
            type="button"
            className={key === studyType ? 'primary' : 'secondary'}
            aria-pressed={key === studyType}
            onClick={() => setStudyType(key)}
          >
            {statStudyTypeLabels[key]}
          </button>
        ))}
      </div>
      {/* Named apart from the textbook filter of "Textbooks and schedules" below, which covers only that card. */}
      <label className="textbook-filter">
        Textbook
        <select
          aria-label="Study time textbook"
          value={textbookId}
          onChange={(event) => setTextbookId(event.target.value)}
        >
          <option value="">All</option>
          {textbooks?.map((book) => (
            <option key={book.id} value={book.id}>
              {book.title}
            </option>
          ))}
        </select>
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
        <section className="metric-grid" aria-label="Study time metrics">
          <article className="card metric">
            <h2>Total study time</h2>
            <p className="metric-value">{formatMinutes(stats.cumulativeMinutes)}</p>
            <p className="status">
              Recorded so far: {statStudyTypeLabels[studyType]}
              {bookTitle && ` · ${bookTitle}`}
            </p>
          </article>
          <article className="card metric">
            <h2>Today</h2>
            <p className="metric-value">{formatMinutes(stats.todayMinutes)}</p>
            <p className="status">{stats.to}</p>
          </article>
          <article className="card metric">
            <h2>{label}</h2>
            <p className="metric-value">{formatMinutes(stats.totalMinutes)}</p>
            {/* Breaks only around "~", never inside a date. */}
            <p className="status">
              <span className="nowrap">{stats.from}</span> ~{' '}
              <span className="nowrap">{stats.to}</span>
            </p>
            <p className="status">
              {stats.studyDays} of {stats.days} days studied
            </p>
          </article>
          <article className="card metric">
            <h2>Daily average</h2>
            <p className="metric-value">{formatMinutes(stats.averageMinutesPerDay)}</p>
            <p className="status">Based on {label}</p>
            <p className="status">
              Study days only: {formatMinutes(stats.averageMinutesPerStudyDay)}
            </p>
          </article>
        </section>
      )}
      {stats && !error && (
        <StudyTimeChart
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
