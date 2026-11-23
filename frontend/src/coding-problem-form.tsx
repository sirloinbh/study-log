import { useState } from 'react';

import {
  attemptBody,
  type AttemptDraft,
  attemptIssue,
  codingLimits,
  emptyAttempt,
  type Site,
  siteLabels,
} from './coding';
import { AttemptFields } from './coding-attempt-fields';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { NativeSelect } from './components/ui/native-select';
import { ButtonSpinner } from './loading';

const keyHint: Record<Site, string> = {
  baekjoon: 'e.g. 1000',
  leetcode: 'e.g. two-sum',
  other: 'e.g. A-12',
};

// Adds a problem together with its first attempt. `onSubmit` resolves when the problem is saved and
// rejects with the server's message; the form is emptied only after it resolves.
export function CodingProblemForm({
  today,
  busy,
  spinning,
  onSubmit,
  onInvalid,
}: {
  today: string;
  busy: boolean;
  spinning: boolean;
  onSubmit: (body: object) => Promise<boolean>;
  onInvalid: (message: string) => void;
}) {
  const [site, setSite] = useState<Site>('baekjoon');
  const [problemKey, setProblemKey] = useState('');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
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
      attempt: attemptBody(draft),
    });
    if (!saved) return;
    setProblemKey('');
    setTitle('');
    setUrl('');
    setDraft(emptyAttempt(today));
  };

  return (
    <form className="log-form coding-form" onSubmit={(event) => void submit(event)}>
      <label>
        Site
        <NativeSelect
          disabled={busy}
          value={site}
          onChange={(event) => setSite(event.target.value as Site)}
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
          placeholder={keyHint[site]}
          disabled={busy}
          value={problemKey}
          onChange={(event) => setProblemKey(event.target.value)}
        />
      </label>
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
