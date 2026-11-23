import React, { useState } from 'react';

import { Button } from './components/ui/button';
import { NativeSelect } from './components/ui/native-select';
import { apiKey, useApiQuery } from './lib/query';
import { Loading } from './loading';
import { plural } from './plural';
import { formatMinutes } from './study-logs-data';
import { chapterPercent, type TextbookStats as Stats, textbookStatsPath } from './study-stats';

const shownRate = (rate: number | null) => (rate === null ? '—' : `${rate}%`);

// Textbooks and schedules (#51), from GET /api/stats/textbooks: chapters done per book, and how
// schedules were kept, for all of them or for one book.
export function TextbookStats() {
  const [textbookId, setTextbookId] = useState('');
  // One cached answer per pick, so a slow answer for another pick never replaces this one's. The choices
  // come from the unfiltered answer, which is the first one asked for.
  const path = textbookStatsPath(textbookId);
  const query = useApiQuery<Stats>(apiKey(path), path);
  const all = useApiQuery<Stats>(apiKey(textbookStatsPath('')), textbookStatsPath(''));
  const stats = query.data;
  const error = query.error?.message;
  const choices = all.data?.textbooks ?? [];

  return (
    <section className="card" aria-label="Textbooks and schedules">
      <h2>Textbooks and schedules</h2>
      <label className="mb-4 grid max-w-80 grid-cols-[minmax(0,1fr)] gap-1.5 text-[12px] font-medium">
        Textbook
        <NativeSelect
          className="w-full min-w-0"
          value={textbookId}
          onChange={(event) => setTextbookId(event.target.value)}
        >
          <option value="">All</option>
          {choices.map((book) => (
            <option key={book.id} value={book.id}>
              {book.title}
            </option>
          ))}
        </NativeSelect>
      </label>
      {error ? (
        <>
          <p role="alert" className="error">
            Could not load the textbook stats: {error}
          </p>
          {/* With the first answer lost there is no other pick to come back from. */}
          <Button type="button" variant="outline" onClick={() => void query.refetch()}>
            Reload
          </Button>
        </>
      ) : !stats ? (
        <Loading label="Loading the textbook stats" kind="text" />
      ) : (
        <>
          <dl className="retro-summary" aria-label="Schedule metrics">
            <div>
              <dt>Achievement rate</dt>
              <dd>{shownRate(stats.schedule.achievementRate)}</dd>
            </div>
            <div>
              <dt>Goal time done</dt>
              <dd>
                {formatMinutes(stats.schedule.achievedMinutes)} /{' '}
                {formatMinutes(stats.schedule.plannedMinutes)}
              </dd>
            </div>
            <div>
              <dt>On-time rate</dt>
              <dd>{shownRate(stats.schedule.adherenceRate)}</dd>
            </div>
            <div>
              <dt>Days done on time</dt>
              <dd>
                {stats.schedule.onTimeDays} / {plural(stats.schedule.dueDays, 'day')}
              </dd>
            </div>
          </dl>
          {stats.schedule.dueDays === 0 && (
            <p className="status m-0">No schedule has passed its due date yet</p>
          )}
          {stats.textbooks.length === 0 ? (
            <p className="status m-0">No textbooks registered yet</p>
          ) : (
            <ul className="m-0 grid list-none gap-3.5 p-0">
              {stats.textbooks.map((book) => (
                <li key={book.id}>
                  <p className="m-0 mb-1.5 flex flex-wrap justify-between gap-x-3 gap-y-1">
                    <span className="log-studied">{book.title}</span>
                    <span className="status">
                      {book.totalChapters === 0
                        ? 'No contents'
                        : `${book.completedChapters} / ${book.totalChapters} chapters`}
                    </span>
                  </p>
                  {book.totalChapters > 0 && (
                    <div
                      role="progressbar"
                      className="h-2 overflow-hidden rounded-[4px] bg-muted"
                      aria-label={`${book.title} completed chapters`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={chapterPercent(book)}
                    >
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${chapterPercent(book)}%` }}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
