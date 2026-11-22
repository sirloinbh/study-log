import { Button } from './components/ui/button';
import { exerciseLimits } from './exercise';
import { ButtonSpinner, Loading } from './loading';
import type { AnswerPanel } from './use-answer-panel';

// What the panel shows under an exercise: the answer being typed, its error, loading, or the saved
// answer with a button to add or edit it.
export function ExerciseAnswerView({
  panel,
  label,
  busy,
  action,
  onChange,
  onSave,
  onStartEdit,
  onCancelEdit,
}: {
  panel: AnswerPanel;
  label: string;
  busy: boolean;
  action: string | undefined;
  onChange: (event: { target: { value: string } }) => void;
  onSave: (event: { preventDefault(): void }) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
}) {
  return (
    <div className="exercise-answer">
      {panel.draft !== undefined ? (
        <form className="log-form answer-form" onSubmit={onSave}>
          <label className="wide">
            Answer
            <textarea
              id="answer-body"
              // eslint-disable-next-line jsx-a11y-x/no-autofocus -- this field opens on a click, so focus follows that action.
              autoFocus
              rows={4}
              maxLength={exerciseLimits.answer}
              disabled={busy}
              value={panel.draft}
              onChange={onChange}
            />
          </label>
          <p className="wide status">Saving it empty clears the answer</p>
          <div className="actions wide">
            <Button type="submit" disabled={busy}>
              <ButtonSpinner when={action === 'answer'} />
              Save answer
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={onCancelEdit}>
              Cancel
            </Button>
          </div>
        </form>
      ) : panel.error ? (
        <p role="alert" className="error">
          Could not load the answer: {panel.error}
        </p>
      ) : panel.body === undefined ? (
        <Loading label="Loading the answer" kind="text" />
      ) : (
        <>
          <p className="answer-label">Answer</p>
          {panel.body === null ? (
            <p className="status">No answer entered</p>
          ) : (
            <p className="exercise-body">{panel.body}</p>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            aria-label={`${label} ${panel.body === null ? 'add answer' : 'edit answer'}`}
            onClick={onStartEdit}
          >
            {panel.body === null ? 'Add answer' : 'Edit answer'}
          </Button>
        </>
      )}
    </div>
  );
}
