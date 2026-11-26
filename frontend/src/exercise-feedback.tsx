import React, { useState } from 'react';

import { useBusy } from './busy';
import { Button } from './components/ui/button';
import type { AttemptFeedback, FeedbackMode } from './exercise';
import { FileField } from './file-field';
import { type RequestError, requestForm } from './lib/api';
import { ButtonSpinner } from './loading';

const maxBytes = 20 * 1024 * 1024;
const modes: { mode: FeedbackMode; label: string }[] = [
  { mode: 'hint', label: 'Hint' },
  { mode: 'grade', label: 'Grade' },
  { mode: 'explanation', label: 'Explanation' },
];
const modeName: Record<FeedbackMode, string> = {
  hint: 'Hint',
  grade: 'Grade',
  explanation: 'Explanation',
};

// Claude's hint, grade or explanation for the solution of one attempt (#363): type the solution or
// choose a photo, pick what to ask, and every answer stays with the attempt.
export function ExerciseFeedback({
  attemptId,
  label,
  items,
  onSaved,
}: {
  attemptId: number;
  label: string;
  items: AttemptFeedback[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [solution, setSolution] = useState('');
  const [file, setFile] = useState<File | undefined>();
  const [notice, setNotice] = useState<{ kind: 'status' | 'alert'; text: string } | undefined>();
  const { busy, action, nameNext, begin, end } = useBusy();

  const ask = async (mode: FeedbackMode) => {
    if (!solution.trim() && !file)
      return setNotice({ kind: 'alert', text: 'Enter your solution or choose a photo of it' });
    if (file && file.size > maxBytes)
      return setNotice({ kind: 'alert', text: 'The photo must be at most 20 MB' });
    nameNext(mode);
    if (!begin()) return;
    setNotice({ kind: 'status', text: 'Asking Claude… this can take a minute' });
    try {
      const form = new FormData();
      form.append('mode', mode);
      form.append('solution', solution);
      if (file) form.append('file', file);
      await requestForm(`/api/exercise-attempts/${attemptId}/feedback`, form, {
        headers: { 'x-requested-with': 'study-log' },
      });
      setNotice({ kind: 'status', text: `${modeName[mode]} saved with this attempt` });
      setSolution('');
      setFile(undefined);
      onSaved();
    } catch (failure) {
      setNotice({
        kind: 'alert',
        text: `Could not get feedback: ${(failure as RequestError).message}`,
      });
    } finally {
      end();
    }
  };

  return (
    <div className="exercise-feedback">
      {items.map((item) => (
        <article key={item.id} aria-label={`${label} ${modeName[item.mode]} ${item.createdAt}`}>
          <h4>
            {modeName[item.mode]} · {item.createdAt}
          </h4>
          <p className="status">{item.feedback}</p>
        </article>
      ))}
      <Button
        type="button"
        variant="outline"
        aria-expanded={open}
        aria-label={`${label} ${open ? 'hide feedback form' : 'ask Claude'}`}
        onClick={() => setOpen(!open)}
      >
        {open ? 'Close' : 'Ask Claude'}
      </Button>
      {open && (
        <div className="log-form">
          <label>
            Your solution
            <textarea
              rows={4}
              maxLength={20000}
              disabled={busy}
              value={solution}
              onChange={(event) => setSolution(event.target.value)}
            />
          </label>
          <FileField
            label="Or a photo of it (JPEG or PNG, up to 20 MB)"
            accept="image/jpeg,image/png"
            file={file}
            disabled={busy}
            onFile={setFile}
          />
          <div className="log-actions">
            {modes.map(({ mode, label: text }) => (
              <Button
                key={mode}
                type="button"
                variant="outline"
                disabled={busy}
                aria-label={`${label} get ${mode}`}
                onClick={() => void ask(mode)}
              >
                <ButtonSpinner when={action === mode} />
                {text}
              </Button>
            ))}
          </div>
          {/* Always mounted so screen readers announce each new message. */}
          <p role="status" className="status">
            {notice?.kind === 'status' ? notice.text : ''}
          </p>
          {notice?.kind === 'alert' && (
            <p role="alert" className="error">
              {notice.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
