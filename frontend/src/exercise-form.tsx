import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { type ExerciseForm, exerciseLimits } from './exercise';
import { ButtonSpinner } from './loading';

// The form that adds a problem or edits one (`isNew` tells which), for the chapter picked.
export function ExerciseFormView({
  form,
  isNew,
  busy,
  action,
  onSubmit,
  onChange,
  onToggleImportant,
  onClose,
}: {
  form: ExerciseForm;
  isNew: boolean;
  busy: boolean;
  action: string | undefined;
  onSubmit: (event: { preventDefault(): void }) => void;
  onChange: (field: 'number' | 'body') => (event: { target: { value: string } }) => void;
  onToggleImportant: (event: { target: { checked: boolean } }) => void;
  onClose: () => void;
}) {
  return (
    <form className="log-form exercise-form" onSubmit={onSubmit}>
      <p className="wide content-form-heading">{isNew ? 'Add problem' : 'Edit problem'}</p>
      <label>
        Problem number
        <Input
          maxLength={exerciseLimits.number}
          disabled={busy}
          value={form.number}
          onChange={onChange('number')}
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          disabled={busy}
          checked={form.important}
          onChange={onToggleImportant}
        />
        Mark as important
      </label>
      <label className="wide">
        Problem text
        <textarea
          id="exercise-body"
          required
          rows={6}
          maxLength={exerciseLimits.body}
          disabled={busy}
          value={form.body}
          onChange={onChange('body')}
        />
      </label>
      <div className="actions wide">
        <Button type="submit" disabled={busy}>
          <ButtonSpinner when={action === 'save'} />
          {isNew ? 'Add' : 'Save changes'}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
          {isNew ? 'Close' : 'Cancel'}
        </Button>
      </div>
    </form>
  );
}
