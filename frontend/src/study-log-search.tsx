import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useRef, useState } from 'react';

import { useBusy } from './busy';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { NativeSelect } from './components/ui/native-select';
import { apiKey, useApiQuery } from './lib/query';
import { ButtonSpinner } from './loading';
import { Memo } from './memo';
import { DateInput } from './picker-fields';
import {
  emptySearch,
  formatMinutes,
  statusLabels,
  studiedLabel,
  type StudyLog,
  type StudyLogSearch as Search,
  studyLogSearchPath,
} from './study-logs-data';
import type { Textbook } from './textbook';

// Searching past study logs (#18) by words in the memo or difficulties, a date range and a
// textbook. Results are read-only; `reloadKey` changes when logs were saved or deleted, and the
// shown results are searched again.
export function StudyLogSearch({
  textbooks,
  reloadKey,
}: {
  textbooks: Textbook[];
  reloadKey?: number;
}) {
  const [search, setSearch] = useState<Search>(emptySearch);
  // The search submitted last, as its request path. Its answer is cached under that path, so a slow
  // answer for an older search never replaces the newer results.
  const [submitted, setSubmitted] = useState<string>();
  const [pending, setPending] = useState(false);
  const { busy, action, nameNext, begin, end } = useBusy();
  const client = useQueryClient();
  const query = useApiQuery<{ studyLogs: StudyLog[] }>(
    apiKey('/api/study-logs', 'search', submitted),
    submitted ?? '',
    { enabled: submitted !== undefined, staleTime: 0 },
  );
  const { refetch } = query;

  // The results shown until the next search answers. A failed search drops them: they no longer
  // match the conditions in the form, and they are not searched again later.
  const lastShown = useRef<StudyLog[] | undefined>(undefined);
  if (query.isError || submitted === undefined) lastShown.current = undefined;
  else if (query.data) lastShown.current = query.data.studyLogs;
  const logs =
    submitted === undefined || query.isError
      ? undefined
      : (query.data?.studyLogs ?? lastShown.current);
  const error = query.isFetching ? undefined : query.error?.message;

  // A new search ends its busy state once the answer, or the failure, is in.
  useEffect(() => {
    if (!pending || query.isFetching) return;
    setPending(false);
    end();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, query.isFetching]);

  // Only a change elsewhere (reloadKey) searches the shown results again.
  const lastReload = useRef(reloadKey);
  useEffect(() => {
    if (lastReload.current === reloadKey) return;
    lastReload.current = reloadKey;
    if (submitted === undefined || reloadKey === undefined) return;
    void client.invalidateQueries({ queryKey: apiKey('/api/study-logs', 'search', submitted) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  const find = (event: { preventDefault(): void }) => {
    event.preventDefault();
    nameNext('search');
    if (!begin()) return;
    const path = studyLogSearchPath(search);
    if (path === submitted) void refetch().finally(end);
    else {
      setPending(true);
      setSubmitted(path);
    }
  };

  const change = (field: keyof Search) => (event: { target: { value: string } }) =>
    setSearch((current) => ({ ...current, [field]: event.target.value }));

  return (
    <section className="card" aria-label="Study log search">
      <h2>Study log search</h2>
      <form className="log-form" onSubmit={find}>
        <label className="wide">
          Search term
          <Input
            type="search"
            maxLength={50}
            placeholder="Part of a memo or difficult part"
            disabled={busy}
            value={search.q}
            onChange={change('q')}
          />
        </label>
        <DateInput
          text="Start date"
          disabled={busy}
          max={search.to || undefined}
          value={search.from}
          onChange={change('from')}
        />
        <DateInput
          text="End date"
          disabled={busy}
          min={search.from || undefined}
          value={search.to}
          onChange={change('to')}
        />
        <label className="half">
          Textbook
          <NativeSelect disabled={busy} value={search.textbookId} onChange={change('textbookId')}>
            <option value="">All</option>
            {textbooks.map((book) => (
              <option key={book.id} value={String(book.id)}>
                {book.title}
              </option>
            ))}
          </NativeSelect>
        </label>
        <div className="actions wide">
          <Button type="submit" disabled={busy}>
            <ButtonSpinner when={action === 'search'} />
            Search
          </Button>
        </div>
      </form>
      {error && (
        <p role="alert" className="error">
          Could not search: {error}
        </p>
      )}
      {logs &&
        (logs.length === 0 ? (
          <p role="status" className="status">
            No results
          </p>
        ) : (
          <>
            <p role="status" className="status">
              {logs.length === 100 ? 'Showing the latest 100' : `Found ${logs.length}`}
            </p>
            <ul className="log-list search-results">
              {logs.map((log) => (
                <li key={log.id}>
                  <div className="log-head">
                    <span className="log-date">{log.studyDate}</span>
                    <span>
                      {log.startTime}–{log.endTime}
                    </span>
                    <strong>{formatMinutes(log.durationMinutes)}</strong>
                    <span className={`badge ${log.status}`}>{statusLabels[log.status]}</span>
                    {log.studyType === 'review' && <span className="badge">Review</span>}
                  </div>
                  {log.textbookTitle !== null && <p className="log-studied">{studiedLabel(log)}</p>}
                  {log.difficulties && (
                    <p className="log-memo">Difficult parts: {log.difficulties}</p>
                  )}
                  {log.memo && <Memo text={log.memo} clamp />}
                </li>
              ))}
            </ul>
          </>
        ))}
    </section>
  );
}
