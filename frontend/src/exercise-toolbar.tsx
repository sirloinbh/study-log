import { Button } from './components/ui/button';

// The card heading with its "Add problem" and "Read from file" buttons.
export function ExerciseToolbar({
  disabled,
  readingOpen,
  onAdd,
  onToggleReading,
}: {
  disabled: boolean;
  readingOpen: boolean;
  onAdd: () => void;
  onToggleReading: () => void;
}) {
  return (
    <div className="contents-head">
      <h3 id="exercise-heading" tabIndex={-1}>
        Exercises
      </h3>
      <Button type="button" variant="outline" disabled={disabled} onClick={onAdd}>
        Add problem
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        id="exercise-read"
        aria-expanded={readingOpen}
        onClick={onToggleReading}
      >
        Read from file
      </Button>
    </div>
  );
}
