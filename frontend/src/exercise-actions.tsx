import { Button } from './components/ui/button';
import { DeleteConfirm } from './delete-confirm';

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
  onConfirmDelete: () => Promise<unknown>;
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
      <Button
        type="button"
        variant="outline"
        aria-label={`${label} copy question`}
        onClick={onCopy}
      >
        Copy question
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        aria-expanded={answerOpen}
        aria-label={`${label} ${answerOpen ? 'hide answer' : 'show answer'}`}
        onClick={onToggleAnswer}
      >
        {answerOpen ? 'Hide answer' : 'Show answer'}
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        aria-expanded={translationOpen}
        aria-label={`${label} ${translationOpen ? 'hide translation' : 'show translation'}`}
        onClick={onToggleTranslation}
      >
        {translationOpen ? 'Hide translation' : 'Show translation'}
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        aria-label={`${label} ${important ? 'unmark important' : 'mark important'}`}
        onClick={onMarkImportant}
      >
        {important ? 'Unmark important' : 'Mark important'}
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        aria-label={`${label} edit`}
        onClick={onEdit}
      >
        Edit
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        id={`exercise-delete-${id}`}
        aria-label={`${label} delete`}
        onClick={onAskDelete}
      >
        Delete
      </Button>
      <DeleteConfirm
        open={confirming}
        title="Delete this problem?"
        description={label}
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
      />
    </div>
  );
}
