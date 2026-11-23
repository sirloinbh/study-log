import { useState } from 'react';

import { buttonVariants } from './components/ui/button';
import { Input } from './components/ui/input';
import { exportPath } from './export-path';

const downloads = [
  { path: '/api/export/study-logs.csv', label: 'Download study logs (CSV)' },
  { path: '/api/export/exercises.md', label: 'Download exercises (Markdown)' },
  { path: '/api/export/retrospectives.md', label: 'Download retrospectives (Markdown)' },
] as const;

// Data export (#364): a copy of the study logs (CSV, opens in a spreadsheet), the exercises with their
// answers and the retrospectives (Markdown), optionally for one date range. The browser downloads
// the answer as a file, so nothing is held in the page.
export function DataExport() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const invalid = from !== '' && to !== '' && from > to;
  return (
    <section className="card" aria-label="Data export">
      <h2>Export your data</h2>
      <p className="status">
        Download a copy of your records (exercises come with their answers). Leave the dates empty
        for everything. Exercises are picked by the day they were added, retrospectives by the start
        of their period.
      </p>
      <div className="log-form">
        <label className="half">
          From
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="half">
          To
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        {invalid && (
          <p role="alert" className="error wide">
            The start date cannot be after the end date
          </p>
        )}
        <div className="actions wide flex-wrap">
          {downloads.map(({ path, label }) =>
            invalid ? (
              <span
                key={path}
                aria-disabled="true"
                className={`${buttonVariants({ variant: 'outline' })} opacity-50`}
              >
                {label}
              </span>
            ) : (
              <a
                key={path}
                href={exportPath(path, from, to)}
                download
                className={buttonVariants({ variant: 'outline' })}
              >
                {label}
              </a>
            ),
          )}
        </div>
      </div>
    </section>
  );
}
