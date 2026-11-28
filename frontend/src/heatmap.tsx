import React, { useEffect } from 'react';

import {
  type FinishedDay,
  finishedHeatBands,
  finishedHeatLevel,
  finishedLabel,
  finishedTotal,
} from './finished-stats';
import { apiKey, useApiQuery } from './lib/query';
import { Loading } from './loading';
import { plural } from './plural';
import { heatCellStyle, heatWeeks, monthLabel } from './study-stats';

const cellBase = 'block size-[11px] rounded-[2px]';
// Weekday names and weeks are columns of one month-label row and seven days.
const column = 'grid grid-rows-[16px_repeat(7,11px)] gap-[3px]';
const monthLabelClass =
  'w-[11px] overflow-visible whitespace-nowrap text-[13px] leading-[16px] text-muted-foreground';

// Rows run Sunday to Saturday (#96); Monday, Wednesday and Friday are labelled.
const weekdays = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

// The last year of finished chapters and sections as a GitHub-style heatmap (#50, #481): one
// column per week, Sunday on top, each day shaded by how many were finished.
export function Heatmap() {
  const query = useApiQuery<{ from: string; to: string; daily: FinishedDay[] }>(
    apiKey('/api/stats/finished-days'),
    '/api/stats/finished-days',
  );
  const data = query.data;
  const error = query.error?.message;

  // On a narrow screen the weeks scroll sideways; start at the recent end.
  useEffect(() => {
    if (!data) return;
    const scroller = document.getElementById('heatmap-scroll') as {
      scrollLeft: number;
      scrollWidth: number;
    } | null;
    if (scroller) scroller.scrollLeft = scroller.scrollWidth;
  }, [data]);

  const studied = data?.daily.filter((day) => finishedTotal(day) > 0) ?? [];
  const chapters = studied.reduce((sum, day) => sum + day.chapters, 0);
  const sections = studied.reduce((sum, day) => sum + day.sections, 0);
  const summary = `${plural(studied.length, 'day')} with a finish · ${finishedLabel({ chapters, sections })}`;

  return (
    <section className="card min-w-0" aria-label="Finished in the last year">
      <h2>Last year</h2>
      {error ? (
        <p role="alert" className="error">
          Could not load the heatmap: {error}
        </p>
      ) : !data ? (
        <Loading label="Loading the heatmap" kind="text" />
      ) : (
        <>
          <p className="status mt-0 mb-3">{summary}</p>
          {/* The year is wider than a phone, so the region takes focus and a keyboard can scroll it (#405). */}
          <div
            className="overflow-x-auto pb-1 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
            id="heatmap-scroll"
            role="region"
            aria-label="Heatmap of the last year, scrolls sideways"
            // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- a scrollable region must take focus so a keyboard can scroll it (WCAG 2.1.1).
            tabIndex={0}
          >
            {/* One image for screen readers; each day's value is in its tooltip for the mouse. */}
            <div
              className="flex w-max gap-[3px]"
              role="img"
              aria-label={`${data.from} to ${data.to}: ${summary}`}
            >
              <div
                className={`${column} sticky left-0 z-[1] bg-card pr-1 text-[13px] leading-[11px] text-muted-foreground shadow-[-4px_0_0_var(--card)]`}
                aria-hidden="true"
              >
                <span className={monthLabelClass} />
                {weekdays.map((day, index) => (
                  <span key={index}>{day}</span>
                ))}
              </div>
              {heatWeeks(data.daily).map((week) => (
                <div key={week[0]?.date} className={column} data-week aria-hidden="true">
                  <span className={monthLabelClass}>{monthLabel(week)}</span>
                  {week.map((day, index) =>
                    day ? (
                      <span
                        key={day.date}
                        data-level={finishedHeatLevel(finishedTotal(day))}
                        className={`${cellBase} ${heatCellStyle[finishedHeatLevel(finishedTotal(day))]}`}
                        title={`${day.date}: ${finishedLabel(day)}`}
                      />
                    ) : (
                      <span
                        key={`after-${index}`}
                        data-level="future"
                        className={`${cellBase} ${heatCellStyle.future}`}
                      />
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
          <ul
            className="mx-0 mt-3 mb-0 flex list-none flex-wrap gap-x-[14px] gap-y-1.5 p-0 text-[13px] text-muted-foreground"
            aria-label="Intensity levels"
          >
            {finishedHeatBands.map((band) => (
              <li key={band.level} className="flex items-center gap-1.5">
                <span
                  data-level={band.level}
                  className={`${cellBase} ${heatCellStyle[band.level]}`}
                  aria-hidden="true"
                />
                {band.label}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
