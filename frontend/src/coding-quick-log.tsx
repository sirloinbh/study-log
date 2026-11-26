import { useState } from 'react';

import {
  attemptBody,
  type CodingSummary,
  emptyAttempt,
  fallbackTitle,
  type GoalItem,
  type GoalListRow,
  languageChoices,
  minutePresets,
  parseNewProblem,
  type ProblemRow,
  type Result,
  resultLabels,
  type Site,
  siteLabels,
  type SolvedProblem,
} from './coding';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { SegmentedControl } from './components/ui/segmented-control';
import { requestJson } from './lib/api';
import { apiKey, useApiQuery } from './lib/query';
import { ButtonSpinner } from './loading';

type Change = (
  name: string,
  request: { path: string; method: string; body?: object },
  done: string,
) => Promise<boolean>;

// A problem that is not in the log yet: the site and key, and a title when a goal list gave one.
type NewOne = { site: Site; problemKey: string; title?: string };
type Picked =
  { kind: 'known'; problem: Pick<ProblemRow, 'id' | 'title'> } | { kind: 'new'; problem: NewOne };

const resultOptions = (Object.keys(resultLabels) as Result[]).map((value) => ({
  value,
  label: resultLabels[value],
}));
const minuteOptions = [
  { value: '', label: 'No time' },
  ...minutePresets.map((value) => ({ value, label: `${value} min` })),
];

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

// "Log a solve" (#427): pick a problem, then the result, language and minutes from short choices
// and save. A known problem takes two taps once it is on screen: the problem, then Save.
export function CodingQuickLog({
  today,
  busy,
  action,
  change,
}: {
  today: string;
  busy: boolean;
  action: string | undefined;
  change: Change;
}) {
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<Picked>();
  const [result, setResult] = useState<Result>('solved');
  // Until a choice is made the language used last is preselected.
  const [chosenLanguage, setChosenLanguage] = useState<string>();
  const [minutes, setMinutes] = useState('');
  const [looking, setLooking] = useState(false);

  const summary = useApiQuery<CodingSummary>(
    apiKey('/api/coding', 'summary'),
    '/api/coding/summary',
    { staleTime: 0 },
  );
  const typed = parseNewProblem(text);
  // A pasted link is searched by its problem key: the server accepts at most 50 characters.
  const search = typed ? typed.problemKey : text.trim().slice(0, 50);
  const path = `/api/coding/problems?limit=6${search ? `&q=${encodeURIComponent(search)}` : ''}`;
  const found = useApiQuery<{ problems: ProblemRow[] }>(
    apiKey('/api/coding', 'quick', path),
    path,
    {
      staleTime: 0,
    },
  );
  const candidates = found.data?.problems ?? [];

  // The next problems of the goal lists come first while nothing is typed (#426).
  const goals = useApiQuery<{ lists: GoalListRow[] }>(
    apiKey('/api/coding', 'goals'),
    '/api/coding/goals',
    { staleTime: 0 },
  );
  const goalNext: GoalItem[] = search
    ? []
    : (goals.data?.lists ?? []).flatMap((list) => list.next.slice(0, 2)).slice(0, 4);
  const goalKeys = new Set(goalNext.map((item) => `${item.site}:${item.problemKey}`));
  const recent = candidates.filter((p) => !goalKeys.has(`${p.site}:${p.problemKey}`));
  const pickGoal = (item: GoalItem) =>
    setPicked(
      item.problemId === null
        ? {
            kind: 'new',
            problem: { site: item.site, problemKey: item.problemKey, title: item.title },
          }
        : { kind: 'known', problem: { id: item.problemId, title: item.title } },
    );
  const goalPicked = (item: GoalItem) =>
    picked !== undefined &&
    (picked.kind === 'known'
      ? picked.problem.id === item.problemId
      : picked.problem.site === item.site && picked.problem.problemKey === item.problemKey);

  const known = typed
    ? candidates.some((p) => p.site === typed.site && p.problemKey === typed.problemKey)
    : true;

  const lastLanguage = summary.data?.lastLanguage ?? '';
  const language = chosenLanguage ?? lastLanguage;
  // The order stays while choosing: it follows the language used last, not the one just tapped.
  const languages = languageChoices(lastLanguage);
  const languageOptions = languages.map((value) => ({ value, label: value }));
  const languageValue = language || languages[0] || '';

  const save = async () => {
    if (!picked || looking) return;
    const draft = { ...emptyAttempt(today), result, language: languageValue, minutes };
    const attempt = attemptBody(draft, false);
    let saved: boolean;
    if (picked.kind === 'known') {
      saved = await change(
        'quick-log',
        {
          path: `/api/coding/problems/${picked.problem.id}/attempts`,
          method: 'POST',
          body: attempt,
        },
        `Logged ${picked.problem.title}: ${resultLabels[result]}`,
      );
    } else {
      // A new problem gets its real title from solved.ac when that answers, else a made-up one.
      setLooking(true);
      let title = picked.problem.title ?? fallbackTitle(picked.problem);
      try {
        if (!picked.problem.title && picked.problem.site === 'baekjoon') {
          const data = await requestJson<{ problem: SolvedProblem }>(
            `/api/coding/solvedac/problems/${encodeURIComponent(picked.problem.problemKey)}`,
          );
          title = data.problem.title;
        }
      } catch {
        // solved.ac did not answer: the made-up title stays and can be edited later.
      } finally {
        setLooking(false);
      }
      saved = await change(
        'quick-log',
        {
          path: '/api/coding/problems',
          method: 'POST',
          body: {
            site: picked.problem.site,
            problemKey: picked.problem.problemKey,
            title,
            attempt,
          },
        },
        `Logged ${title}: ${resultLabels[result]}`,
      );
    }
    if (!saved) return;
    setPicked(undefined);
    setText('');
    setMinutes('');
    setResult('solved');
  };

  const total = summary.data;
  return (
    <section className="card coding-quick" aria-label="Log a solve">
      <h2>Log a solve</h2>
      {total && (
        <p className="coding-today" aria-label="Practice so far">
          <span>
            Today: {plural(total.today.solved, 'solve')}
            {total.today.minutes > 0 && `, ${total.today.minutes} min`}
          </span>
          <span>This week: {plural(total.week.solved, 'solve')}</span>
          <span>Streak: {plural(total.streak, 'day')}</span>
        </p>
      )}
      <label className="coding-find">
        Find a problem
        <Input
          maxLength={200}
          placeholder="Title, number or link"
          value={text}
          disabled={busy}
          onChange={(event) => {
            setText(event.target.value);
            setPicked(undefined);
          }}
        />
      </label>
      <div className="coding-pick" role="group" aria-label="Problems to pick">
        {typed && !known && (
          <Button
            type="button"
            variant="outline"
            aria-pressed={picked?.kind === 'new'}
            disabled={busy}
            onClick={() => setPicked({ kind: 'new', problem: typed })}
          >
            New: {siteLabels[typed.site]} {typed.problemKey}
          </Button>
        )}
        {goalNext.map((item) => (
          <Button
            key={`goal-${item.id}`}
            type="button"
            variant="outline"
            aria-pressed={goalPicked(item)}
            disabled={busy}
            onClick={() => pickGoal(item)}
          >
            Next: {item.title} ({item.problemKey})
          </Button>
        ))}
        {recent.map((problem) => (
          <Button
            key={problem.id}
            type="button"
            variant="outline"
            aria-pressed={picked?.kind === 'known' && picked.problem.id === problem.id}
            disabled={busy}
            onClick={() => setPicked({ kind: 'known', problem })}
          >
            {problem.title} ({problem.problemKey})
          </Button>
        ))}
        {found.error && (
          <p role="alert" className="error">
            Could not load the problems: {found.error.message}
          </p>
        )}
        {found.data && candidates.length === 0 && goalNext.length === 0 && !(typed && !known) && (
          <p className="status">
            {search ? 'No recorded problem matches' : 'No problems yet. Type a number or a link'}
          </p>
        )}
      </div>
      {picked && (
        <div className="coding-choices">
          <SegmentedControl
            label="Solve result"
            options={resultOptions}
            value={result}
            onValueChange={setResult}
          />
          <SegmentedControl
            label="Solve language"
            options={languageOptions}
            value={languageValue}
            onValueChange={setChosenLanguage}
          />
          <SegmentedControl
            label="Solve minutes"
            options={minuteOptions}
            value={minutes}
            onValueChange={setMinutes}
          />
          <Button type="button" disabled={busy || looking} onClick={() => void save()}>
            <ButtonSpinner when={action === 'quick-log' || looking} />
            Save solve
          </Button>
        </div>
      )}
    </section>
  );
}
