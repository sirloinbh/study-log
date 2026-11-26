import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useBusy } from './busy';
import {
  type Filters,
  type ImportResult,
  listPath,
  type ProblemRow,
  type Result,
  resultLabels,
  type Site,
  siteLabels,
  type SolvedProblem,
  tierLabel,
} from './coding';
import { CodingGoals } from './coding-goals';
import { CodingProblemDetail } from './coding-problem-detail';
import { CodingProblemForm } from './coding-problem-form';
import { CodingQuickLog } from './coding-quick-log';
import { Button } from './components/ui/button';
import { ConfirmDialog } from './components/ui/confirm-dialog';
import { Input } from './components/ui/input';
import { NativeSelect } from './components/ui/native-select';
import { type RequestError, requestJson } from './lib/api';
import { apiKey, useApiMutation, useApiQuery } from './lib/query';
import { ButtonSpinner, Loading } from './loading';

type Notice = { kind: 'status' | 'alert'; text: string } | undefined;

// The coding problem log (#368): add a problem with its first attempt, list and filter the
// problems, and open one to see, add, edit and delete its attempts.
export function CodingProblems({
  today,
  onChange,
}: {
  today: string;
  // A study log made from an attempt can make a review due.
  onChange?: () => void;
}) {
  const client = useQueryClient();
  const [filters, setFilters] = useState<Filters>({ site: '', result: '', q: '' });
  const [openId, setOpenId] = useState<number>();
  const [notice, setNotice] = useState<Notice>(undefined);
  const { busy, action, nameNext, begin, end } = useBusy();

  const path = listPath(filters);
  const list = useApiQuery<{ problems: ProblemRow[] }>(apiKey('/api/coding', 'list', path), path, {
    staleTime: 0,
  });
  const problems = list.data?.problems;

  const send = useApiMutation<unknown, { path: string; method: string; body?: object }>(
    (request) => request,
  );

  // One change at a time, then the lists are read again while still busy. Resolves to whether it worked.
  const change = async (
    name: string,
    request: { path: string; method: string; body?: object },
    done: string,
  ) => {
    nameNext(name);
    if (!begin()) return false;
    setNotice(undefined);
    try {
      await send.mutateAsync(request);
      setNotice({ kind: 'status', text: done });
      return true;
    } catch (failure) {
      setNotice({ kind: 'alert', text: (failure as RequestError).message });
      return false;
    } finally {
      await client.invalidateQueries({ queryKey: apiKey('/api/coding') });
      onChange?.();
      end();
    }
  };

  const addProblem = (body: object) =>
    change('add-problem', { path: '/api/coding/problems', method: 'POST', body }, 'Problem added');

  const changeFilter = (field: keyof Filters) => (event: { target: { value: string } }) =>
    setFilters((current) => ({ ...current, [field]: event.target.value }));

  const invalid = (text: string) => setNotice({ kind: 'alert', text });

  // Reads from solved.ac without changing anything saved, so it only needs the one-at-a-time guard.
  const lookup = async (number: string): Promise<SolvedProblem | undefined> => {
    nameNext('lookup');
    if (!begin()) return undefined;
    setNotice(undefined);
    try {
      const data = await requestJson<{ problem: SolvedProblem }>(
        `/api/coding/solvedac/problems/${encodeURIComponent(number)}`,
      );
      setNotice({ kind: 'status', text: `Filled in from solved.ac: ${data.problem.title}` });
      return data.problem;
    } catch (failure) {
      setNotice({ kind: 'alert', text: (failure as RequestError).message });
      return undefined;
    } finally {
      end();
    }
  };

  // The two imports differ only in the route and the wording.
  const importFrom = async (name: string, route: string, source: string) => {
    nameNext(name);
    if (!begin()) return;
    setNotice(undefined);
    try {
      const result = await requestJson<ImportResult>(route, { method: 'POST' });
      setNotice({
        kind: 'status',
        text: `Imported from ${source}: ${result.added} added, ${result.skipped} already recorded`,
      });
    } catch (failure) {
      setNotice({ kind: 'alert', text: (failure as RequestError).message });
    } finally {
      await client.invalidateQueries({ queryKey: apiKey('/api/coding') });
      end();
    }
  };
  const importSolved = () => importFrom('import', '/api/coding/solvedac/import', 'solved.ac');
  const importLeetCode = () =>
    importFrom('import-leetcode', '/api/coding/leetcode/import', 'LeetCode');

  return (
    <div className="coding">
      {/* Always mounted so screen readers announce each new message. */}
      <p role="status" className="status">
        {notice?.kind === 'status' ? notice.text : ''}
      </p>
      {notice?.kind === 'alert' && (
        <p role="alert" className="error">
          {notice.text}
        </p>
      )}
      <CodingQuickLog today={today} busy={busy} action={action} change={change} />
      <CodingGoals
        onChange={onChange}
        notify={setNotice}
        onOpenProblem={(item) => {
          // Shows just that problem with its attempts open, and brings the log into view.
          setFilters({ site: item.site, result: '', q: item.problemKey });
          setOpenId(item.problemId ?? undefined);
          document.getElementById('coding-problems')?.scrollIntoView?.({ block: 'start' });
        }}
      />
      <section className="card" aria-label="Add a problem">
        <h2>Add a problem</h2>
        <CodingProblemForm
          today={today}
          busy={busy}
          action={action}
          spinning={action === 'add-problem'}
          onSubmit={addProblem}
          onInvalid={invalid}
          onLookup={lookup}
        />
      </section>

      <section className="card" aria-label="Import">
        <h2>Import from solved.ac</h2>
        <p className="status">
          Adds the Baekjoon problems your solved.ac account has solved. Problems already recorded
          are skipped, so you can run it again.
        </p>
        <div className="actions">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void importSolved()}
          >
            <ButtonSpinner when={action === 'import'} />
            Import solved problems
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void importLeetCode()}
          >
            <ButtonSpinner when={action === 'import-leetcode'} />
            Import recent LeetCode submissions
          </Button>
        </div>
      </section>

      <section className="card" id="coding-problems" aria-label="Problems">
        <h2>Problems</h2>
        <div className="log-form coding-filters">
          <label>
            Site
            <NativeSelect value={filters.site} onChange={changeFilter('site')}>
              <option value="">All sites</option>
              {(Object.keys(siteLabels) as Site[]).map((site) => (
                <option key={site} value={site}>
                  {siteLabels[site]}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label>
            Latest result
            <NativeSelect value={filters.result} onChange={changeFilter('result')}>
              <option value="">Any result</option>
              {(Object.keys(resultLabels) as Result[]).map((result) => (
                <option key={result} value={result}>
                  {resultLabels[result]}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label>
            Search
            <Input maxLength={50} value={filters.q} onChange={changeFilter('q')} />
          </label>
        </div>
        {list.error ? (
          <p role="alert" className="error">
            Could not load the problems: {list.error.message}
          </p>
        ) : problems === undefined ? (
          <Loading label="Loading the problems" />
        ) : problems.length === 0 ? (
          <p className="status">No problems yet</p>
        ) : (
          <ul className="log-list coding-list">
            {problems.map((problem) => (
              <li key={problem.id}>
                <div className="log-head">
                  <span className="log-date">
                    {siteLabels[problem.site]} {problem.problemKey}
                  </span>
                  {problem.url ? (
                    <a href={problem.url} target="_blank" rel="noopener noreferrer">
                      {problem.title}
                    </a>
                  ) : (
                    <span>{problem.title}</span>
                  )}
                </div>
                {problem.difficulty !== null && <p className="log-memo">{problem.difficulty}</p>}
                {problem.level !== null && (
                  <p className="log-memo">
                    {tierLabel(problem.level)}
                    {problem.tags.length > 0 && `, ${problem.tags.join(', ')}`}
                  </p>
                )}
                <p className="log-memo">
                  {problem.attemptCount === 0
                    ? 'No attempts'
                    : `${problem.attemptCount} ${problem.attemptCount === 1 ? 'attempt' : 'attempts'}, ` +
                      `${problem.totalMinutes} min, latest ${problem.lastAttemptDate}: ` +
                      (problem.lastResult ? resultLabels[problem.lastResult] : '')}
                </p>
                <div className="log-actions">
                  <Button
                    type="button"
                    variant="outline"
                    aria-expanded={openId === problem.id}
                    aria-label={`${problem.title} attempts`}
                    onClick={() => setOpenId(openId === problem.id ? undefined : problem.id)}
                  >
                    {openId === problem.id ? 'Hide attempts' : 'Attempts'}
                  </Button>
                  <ConfirmDialog
                    title="Delete this problem?"
                    description="Its attempts are deleted too. Study logs made from them stay."
                    onConfirm={async () => {
                      const deleted = await change(
                        'delete-problem',
                        { path: `/api/coding/problems/${problem.id}`, method: 'DELETE' },
                        'Problem deleted',
                      );
                      if (deleted && openId === problem.id) setOpenId(undefined);
                    }}
                    trigger={
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        aria-label={`${problem.title} delete`}
                      >
                        Delete
                      </Button>
                    }
                  />
                </div>
                {openId === problem.id && (
                  <CodingProblemDetail
                    problem={problem}
                    today={today}
                    busy={busy}
                    action={action}
                    change={change}
                    onInvalid={invalid}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
