import { ButtonSpinner } from './loading';

// The form that adds a chapter or section, or edits an entry (`isNew` tells which).
export function ContentsEntryForm({
  heading,
  number,
  title,
  isNew,
  busy,
  action,
  onSubmit,
  onChange,
  onCancel,
}: {
  heading: string;
  number: string;
  title: string;
  isNew: boolean;
  busy: boolean;
  action: string | undefined;
  onSubmit: (event: { preventDefault(): void }) => void;
  onChange: (field: 'number' | 'title') => (event: { target: { value: string } }) => void;
  onCancel: () => void;
}) {
  return (
    <form className="log-form content-form" onSubmit={onSubmit}>
      <p className="wide content-form-heading">{heading}</p>
      <label>
        Number
        <input
          maxLength={20}
          placeholder="e.g. 1.2"
          disabled={busy}
          value={number}
          onChange={onChange('number')}
        />
      </label>
      <label className="title">
        Contents title
        <input
          // eslint-disable-next-line jsx-a11y-x/no-autofocus -- this field opens on a click, so focus follows that action.
          autoFocus
          required
          maxLength={200}
          disabled={busy}
          value={title}
          onChange={onChange('title')}
        />
      </label>
      <div className="actions wide">
        <button type="submit" className="primary" disabled={busy}>
          <ButtonSpinner when={action === 'save'} />
          {isNew ? 'Add' : 'Save changes'}
        </button>
        <button type="button" className="secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
