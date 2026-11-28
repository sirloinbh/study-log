import { useState } from 'react';

import {
  attemptBody,
  type AttemptDraft,
  attemptIssue,
  codingLimits,
  emptyAttempt,
  type Site,
  siteLabels,
  type SolvedProblem,
  tierLabel,
} from './coding';
import { AttemptFields } from './coding-attempt-fields';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { NativeSelect } from './components/ui/native-select';
import { ButtonSpinner } from './loading';

// Adds a problem together with its first attempt. `onSubmit` resolves when the problem is saved and
// rejects with the server's message; the form is emptied only after it resolves.
export function CodingProblemForm({
  today,
  busy,
  action,
  spinning,
  onSubmit,
  onInvalid,
  onLookup,
}: {
  today: string;
  busy: boolean;
  action: string | undefined;
  spinning: boolean;
  onSubmit: (body: object) => Promise<boolean>;
  onInvalid: (message: string) => void;
  // Reads a Baekjoon problem from solved.ac; resolves to undefined when it could not.
  onLookup: (number: string) => Promise<SolvedProblem | undefined>;
}) {
  const [site, setSite] = useState<Site>('baekjoon');
  const [problemKey, setProblemKey] = useState('');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [level, setLevel] = useState<number>();
  const [tags, setTags] = useState<string[]>([]);
  const [draft, setDraft] = useState<AttemptDraft>(() => emptyAttempt(today));

  const submit = async (event: { preventDefault(): void }) => {
    event.preventDefault();
    const issue = attemptIssue(draft);
    if (issue) return onInvalid(issue);
    const saved = await onSubmit({
      site,
      problemKey,
      title,
      ...(url.trim() ? { url } : {}),
      ...(site === 'baekjoon' && level !== undefined ? { level, tags } : {}),
      attempt: attemptBody(draft),
    });
    if (!saved) return;
    setProblemKey('');
    setTitle('');
    setUrl('');
    setLevel(undefined);
    setTags([]);
    setDraft(emptyAttempt(today));
  };

  const lookup = async () => {
    const found = await onLookup(problemKey.trim());
    if (!found) return;
    setTitle(found.title);
    setLevel(found.level);
    setTags(found.tags);
  };

  return (
    <form className="log-form coding-form" onSubmit={(event) => void submit(event)}>
      <label>
        Site
        <NativeSelect
          disabled={busy}
          value={site}
          onChange={(event) => {
            setSite(event.target.value as Site);
            setLevel(undefined);
            setTags([]);
          }}
        >
          {(Object.keys(siteLabels) as Site[]).map((value) => (
            <option key={value} value={value}>
              {siteLabels[value]}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label>
        Problem ID
        <Input
          id="coding-key"
          required
          maxLength={codingLimits.key}
          disabled={busy}
          value={problemKey}
          onChange={(event) => {
            setProblemKey(event.target.value);
            setLevel(undefined);
            setTags([]);
          }}
        />
      </label>
      {site === 'baekjoon' && (
        <div className="actions wide">
          <Button
            type="button"
            variant="outline"
            disabled={busy || !problemKey.trim()}
            onClick={() => void lookup()}
          >
            <ButtonSpinner when={action === 'lookup'} />
            Fill in from solved.ac
          </Button>
          {level !== undefined && (
            <span className="status">
              {tierLabel(level)}
              {tags.length > 0 && `, ${tags.join(', ')}`}
            </span>
          )}
        </div>
      )}
      <label className="wide">
        Title
        <Input
          required
          maxLength={codingLimits.title}
          disabled={busy}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label className="wide">
        Link (optional, filled in for Baekjoon and LeetCode)
        <Input
          type="url"
          maxLength={codingLimits.url}
          disabled={busy}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
      </label>
      <AttemptFields
        draft={draft}
        idPrefix="coding-new"
        busy={busy}
        withLog
        onChange={(change) => setDraft((current) => ({ ...current, ...change }))}
      />
      <div className="actions wide">
        <Button type="submit" disabled={busy}>
          <ButtonSpinner when={spinning} />
          Add problem
        </Button>
      </div>
    </form>
  );
}
