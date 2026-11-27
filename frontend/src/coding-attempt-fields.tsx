import { type AttemptDraft, codingLimits, type Result, resultLabels } from './coding';
import { Checkbox } from './components/ui/checkbox';
import { Input } from './components/ui/input';
import { NativeSelect } from './components/ui/native-select';
import { DateInput, TimeInput } from './picker-fields';

// The fields of one attempt, shared by the new-problem form, the add-attempt form and the editor.
// `idPrefix` keeps the ids of two forms on one screen apart. A study log can only be asked for
// when `withLog` is set: an edit never changes a log made earlier.
export function AttemptFields({
  draft,
  idPrefix,
  busy,
  withLog,
  onChange,
}: {
  draft: AttemptDraft;
  idPrefix: string;
  busy: boolean;
  withLog: boolean;
  onChange: (change: Partial<AttemptDraft>) => void;
}) {
  return (
    <>
      <DateInput
        text="Date"
        required
        disabled={busy}
        value={draft.date}
        onChange={(event) => onChange({ date: event.target.value })}
      />
      <label>
        Result
        <NativeSelect
          disabled={busy}
          value={draft.result}
          onChange={(event) => onChange({ result: event.target.value as Result })}
        >
          {(Object.keys(resultLabels) as Result[]).map((result) => (
            <option key={result} value={result}>
              {resultLabels[result]}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label>
        Language
        <Input
          maxLength={codingLimits.language}
          placeholder="e.g. Python"
          disabled={busy}
          value={draft.language}
          onChange={(event) => onChange({ language: event.target.value })}
        />
      </label>
      <label>
        Minutes spent
        <Input
          inputMode="numeric"
          disabled={busy}
          value={draft.minutes}
          onChange={(event) => onChange({ minutes: event.target.value })}
        />
      </label>
      <label className="wide">
        Notes
        <Input
          maxLength={codingLimits.notes}
          disabled={busy}
          value={draft.notes}
          onChange={(event) => onChange({ notes: event.target.value })}
        />
      </label>
      {withLog && (
        <div className="wide coding-log-option">
          <div className="coding-checkbox">
            <Checkbox
              id={`${idPrefix}-log`}
              disabled={busy}
              checked={draft.logOn}
              onCheckedChange={(checked) => onChange({ logOn: checked === true })}
            />
            <label htmlFor={`${idPrefix}-log`}>Also record a study log</label>
          </div>
          {draft.logOn && (
            <TimeInput
              text="Study log start time"
              disabled={busy}
              value={draft.startTime}
              onChange={(event) => onChange({ startTime: event.target.value })}
            />
          )}
        </div>
      )}
    </>
  );
}
