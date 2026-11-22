import { ButtonSpinner } from './loading';

// The buttons under one exercise: copy, answer, translation, important mark, edit and delete, or
// the confirmation that replaces them while a delete is asked for.
export function ExerciseActions({
  id,
  label,
  important,
  confirming,
  answerOpen,
  translationOpen,
  busy,
  action,
  onConfirmDelete,
  onCancelDelete,
  onCopy,
  onToggleAnswer,
  onToggleTranslation,
  onMarkImportant,
  onEdit,
  onAskDelete,
}: {
  id: number;
  label: string;
  important: boolean;
  confirming: boolean;
  answerOpen: boolean;
  translationOpen: boolean;
  busy: boolean;
  action: string | undefined;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onCopy: () => void;
  onToggleAnswer: () => void;
  onToggleTranslation: () => void;
  onMarkImportant: () => void;
  onEdit: () => void;
  onAskDelete: () => void;
}) {
  return (
    <div className="log-actions">
      {confirming ? (
        <>
          <button
            type="button"
            id={`exercise-delete-confirm-${id}`}
            className="danger"
            disabled={busy}
            aria-label={`${label} confirm deletion`}
            onClick={onConfirmDelete}
          >
            <ButtonSpinner when={action === 'delete'} />
            Confirm delete
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            aria-label={`${label} cancel deletion`}
            onClick={onCancelDelete}
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className="secondary"
            aria-label={`${label} copy question`}
            onClick={onCopy}
          >
            Copy question
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            aria-expanded={answerOpen}
            aria-label={`${label} ${answerOpen ? 'hide answer' : 'show answer'}`}
            onClick={onToggleAnswer}
          >
            {answerOpen ? 'Hide answer' : 'Show answer'}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            aria-expanded={translationOpen}
            aria-label={`${label} ${translationOpen ? 'hide translation' : 'show translation'}`}
            onClick={onToggleTranslation}
          >
            {translationOpen ? 'Hide translation' : 'Show translation'}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            aria-label={`${label} ${important ? 'unmark important' : 'mark important'}`}
            onClick={onMarkImportant}
          >
            {important ? 'Unmark important' : 'Mark important'}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            aria-label={`${label} edit`}
            onClick={onEdit}
          >
            Edit
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            id={`exercise-delete-${id}`}
            aria-label={`${label} delete`}
            onClick={onAskDelete}
          >
            Delete
          </button>
        </>
      )}
    </div>
  );
}
