import React, { useEffect, useState } from 'react';

import { type RequestError, requestJson } from './api';
import { Loading } from './loading';
import { formatMinutes } from './study-logs-data';
import { chapterPercent, type TextbookStats as Stats, textbookStatsPath } from './study-stats';

const shownRate = (rate: number | null) => (rate === null ? '—' : `${rate}%`);

// Textbooks and schedules (#51), from GET /api/stats/textbooks: chapters done per book, and how
// schedules were kept, for all of them or for one book.
export function TextbookStats() {
  const [textbookId, setTextbookId] = useState('');
  // Kept per request, so a slow answer for another pick never replaces this one's. The choices come
  // from the unfiltered answer, which is the first one asked for.
  const [loaded, setLoaded] = useState<Partial<Record<string, Stats>>>({});
  const [loadError, setLoadError] = useState<{ path: string; message: string }>();
  const [retry, setRetry] = useState(0);

  const path = textbookStatsPath(textbookId);
  useEffect(() => {
    let current = true;
    requestJson<Stats>(path)
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
  }, [path, retry]);

  const stats = loaded[path];
  const error = loadError?.path === path ? loadError.message : undefined;
  const choices = loaded[textbookStatsPath('')]?.textbooks ?? [];

  return (
    <section className="card textbook-stats" aria-label="Textbooks and schedules">
      <h2>Textbooks and schedules</h2>
      <label className="textbook-filter">
        Textbook
        <select value={textbookId} onChange={(event) => setTextbookId(event.target.value)}>
          <option value="">All</option>
          {choices.map((book) => (
            <option key={book.id} value={book.id}>
              {book.title}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <>
          <p role="alert" className="error">
            Could not load the textbook stats: {error}
          </p>
          {/* With the first answer lost there is no other pick to come back from. */}
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setLoadError(undefined);
              setRetry((count) => count + 1);
            }}
          >
            Reload
          </button>
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
                {stats.schedule.onTimeDays} / {stats.schedule.dueDays} days
              </dd>
            </div>
          </dl>
          {stats.schedule.dueDays === 0 && (
            <p className="status">No schedule has passed its due date yet</p>
          )}
          {stats.textbooks.length === 0 ? (
            <p className="status">No textbooks registered yet</p>
          ) : (
            <ul className="textbook-progress">
              {stats.textbooks.map((book) => (
                <li key={book.id}>
                  <p>
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
                      aria-label={`${book.title} completed chapters`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={chapterPercent(book)}
                    >
                      <div style={{ width: `${chapterPercent(book)}%` }} />
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
