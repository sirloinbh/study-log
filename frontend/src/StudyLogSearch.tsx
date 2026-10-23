import React, { useEffect, useState } from 'react';
import { useBusy } from './busy';
import { requestJson, type RequestError } from './api';
import {
  emptySearch,
  formatMinutes,
  statusLabels,
  studiedLabel,
  studyLogSearchPath,
  type StudyLog,
  type StudyLogSearch as Search,
} from './study-logs';
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
  // The last search run and its results, kept until the next one.
  const [results, setResults] = useState<{ path: string; logs: StudyLog[] }>();
  const [error, setError] = useState<string>();
  const { busy, begin, end } = useBusy();

  const run = async (path: string) => {
    try {
      const data = await requestJson<{ studyLogs: StudyLog[] }>(path);
      setResults({ path, logs: data.studyLogs });
      setError(undefined);
    } catch (failure) {
      setError((failure as RequestError).message);
      // Not searched again later: its results no longer match the conditions in the form.
      setResults(undefined);
    }
  };

  const shownPath = results?.path;
  useEffect(() => {
    if (shownPath === undefined || reloadKey === undefined) return;
    void run(shownPath);
    // Only a change elsewhere (reloadKey) searches the shown results again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  const find = (event: { preventDefault(): void }) => {
    event.preventDefault();
    if (!begin()) return;
    void run(studyLogSearchPath(search)).finally(end);
  };

  const change = (field: keyof Search) => (event: { target: { value: string } }) =>
    setSearch((current) => ({ ...current, [field]: event.target.value }));

  return (
    <section className="card" aria-label="학습 기록 검색">
      <h2>학습 기록 검색</h2>
      <form className="log-form" onSubmit={find}>
        <label className="wide">
          검색어
          <input
            type="search"
            maxLength={50}
            placeholder="메모나 어려웠던 부분의 일부"
            disabled={busy}
            value={search.q}
            onChange={change('q')}
          />
        </label>
        <label>
          시작일
          <input
            type="date"
            disabled={busy}
            max={search.to || undefined}
            value={search.from}
            onChange={change('from')}
          />
        </label>
        <label>
          종료일
          <input
            type="date"
            disabled={busy}
            min={search.from || undefined}
            value={search.to}
            onChange={change('to')}
          />
        </label>
        <label className="half">
          교재
          <select disabled={busy} value={search.textbookId} onChange={change('textbookId')}>
            <option value="">전체</option>
            {textbooks.map((book) => (
              <option key={book.id} value={String(book.id)}>
                {book.title}
              </option>
            ))}
          </select>
        </label>
        <div className="actions wide">
          <button type="submit" className="primary" disabled={busy}>
            검색
          </button>
        </div>
      </form>
      {error && (
        <p role="alert" className="error">
          검색하지 못했습니다: {error}
        </p>
      )}
      {results &&
        (results.logs.length === 0 ? (
          <p role="status" className="status">
            검색 결과가 없습니다
          </p>
        ) : (
          <>
            <p role="status" className="status">
              {results.logs.length === 100
                ? '최근 100개까지 보여 줍니다'
                : `${results.logs.length}개를 찾았습니다`}
            </p>
            <ul className="log-list search-results">
              {results.logs.map((log) => (
                <li key={log.id}>
                  <div className="log-head">
                    <span className="log-date">{log.studyDate}</span>
                    <span>
                      {log.startTime}–{log.endTime}
                    </span>
                    <strong>{formatMinutes(log.durationMinutes)}</strong>
                    <span className={`badge ${log.status}`}>{statusLabels[log.status]}</span>
                  </div>
                  {log.textbookTitle !== null && <p className="log-studied">{studiedLabel(log)}</p>}
                  {log.difficulties && (
                    <p className="log-memo">어려웠던 부분: {log.difficulties}</p>
                  )}
                  {log.memo && <p className="log-memo">{log.memo}</p>}
                </li>
              ))}
            </ul>
          </>
        ))}
    </section>
  );
}
