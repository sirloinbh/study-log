import { Button } from './components/ui/button';
import { Checkbox } from './components/ui/checkbox';
import { NativeSelect } from './components/ui/native-select';
import { ButtonSpinner } from './loading';
import { Memo } from './memo';
import { DateInput, TimeInput } from './picker-fields';
import {
  crossesMidnight,
  formatMinutes,
  previewMinutes,
  statusLabels,
  type StudyLogForm,
  type StudyStatus,
  type StudyType,
  studyTypeLabels,
  understandingLabels,
} from './study-logs-data';
import type { Textbook } from './textbook';

// The form that adds a study log or edits one. Each field reports a patch of the form, typed by
// field, so a text can never land in a number or a choice. The parent owns the form and saves it.
export function StudyLogFormView({
  form,
  editing,
  textbooks,
  chapters,
  busy,
  action,
  onPatch,
  onSubmit,
  onCancel,
}: {
  form: StudyLogForm;
  editing: boolean;
  textbooks: Textbook[];
  chapters: { id: number; label: string }[];
  busy: boolean;
  action: string | undefined;
  onPatch: (patch: Partial<StudyLogForm>) => void;
  onSubmit: (event: { preventDefault(): void }) => void;
  onCancel: () => void;
}) {
  const minutes = previewMinutes(form.startTime, form.endTime);
  // The select values '' and the numbers or words after it become null, a number or a boolean.
  const idOf = (value: string) => (value === '' ? null : Number(value));
  return (
    <form className="log-form" onSubmit={onSubmit}>
      <DateInput
        text="Study date"
        id="study-log-date"
        required
        disabled={busy}
        value={form.studyDate}
        onChange={(event) => onPatch({ studyDate: event.target.value })}
      />
      <TimeInput
        text="Start"
        required
        disabled={busy}
        value={form.startTime}
        onChange={(event) => onPatch({ startTime: event.target.value })}
      />
      <TimeInput
        text="End"
        required
        disabled={busy}
        value={form.endTime}
        onChange={(event) => onPatch({ endTime: event.target.value })}
      />
      <label>
        Status
        <NativeSelect
          disabled={busy}
          value={form.status}
          onChange={(event) => onPatch({ status: event.target.value as StudyStatus })}
        >
          {(Object.keys(statusLabels) as StudyStatus[]).map((status) => (
            <option key={status} value={status}>
              {statusLabels[status]}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className="half">
        Textbook
        <NativeSelect
          disabled={busy}
          value={form.textbookId ?? ''}
          // Picking another textbook clears the chapter, which belonged to the previous one.
          onChange={(event) =>
            onPatch({
              textbookId: idOf(event.target.value),
              contentId: null,
              finishedContentIds: [],
            })
          }
        >
          <option value="">None</option>
          {textbooks.map((book) => (
            <option key={book.id} value={book.id}>
              {book.title}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className="half">
        Chapter/section
        <NativeSelect
          disabled={busy || form.textbookId === null}
          value={form.contentId ?? ''}
          onChange={(event) => onPatch({ contentId: idOf(event.target.value) })}
        >
          <option value="">{form.textbookId === null ? 'Choose a textbook first' : 'None'}</option>
          {chapters.map((chapter) => (
            <option key={chapter.id} value={chapter.id}>
              {chapter.label}
            </option>
          ))}
        </NativeSelect>
      </label>
      {form.textbookId !== null && chapters.length > 0 && (
        <fieldset className="finished-contents wide" disabled={busy}>
          <legend>Finished chapters and sections</legend>
          <div className="max-h-60 overflow-y-auto rounded-md border border-border p-2">
            {chapters.map((chapter) => {
              const id = `finished-content-${chapter.id}`;
              const checked = form.finishedContentIds.includes(chapter.id);
              return (
                <div key={chapter.id} className="flex items-center gap-2 py-1">
                  <Checkbox
                    id={id}
                    checked={checked}
                    onCheckedChange={(on) =>
                      onPatch({
                        finishedContentIds:
                          on === true
                            ? [...form.finishedContentIds, chapter.id]
                            : form.finishedContentIds.filter((value) => value !== chapter.id),
                      })
                    }
                  />
                  <label htmlFor={id} className="whitespace-pre-wrap">
                    {chapter.label}
                  </label>
                </div>
              );
            })}
          </div>
        </fieldset>
      )}
      <label>
        Type
        <NativeSelect
          disabled={busy}
          value={form.studyType}
          onChange={(event) => onPatch({ studyType: event.target.value as StudyType })}
        >
          {(Object.keys(studyTypeLabels) as StudyType[]).map((type) => (
            <option key={type} value={type}>
              {studyTypeLabels[type]}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label>
        Understanding
        <NativeSelect
          disabled={busy}
          value={form.understanding ?? ''}
          onChange={(event) => onPatch({ understanding: idOf(event.target.value) })}
        >
          <option value="">None</option>
          {Object.entries(understandingLabels).map(([score, label]) => (
            <option key={score} value={score}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </label>
      {/* eslint-disable-next-line jsx-a11y-x/label-has-associated-control -- NativeSelect renders a select. */}
      <label className="half">
        Goal achieved
        <NativeSelect
          disabled={busy}
          value={form.goalAchieved === null ? '' : String(form.goalAchieved)}
          onChange={(event) =>
            onPatch({
              goalAchieved: event.target.value === '' ? null : event.target.value === 'true',
            })
          }
        >
          <option value="">None</option>
          <option value="true">Achieved</option>
          <option value="false">Not achieved</option>
        </NativeSelect>
      </label>
      <label className="wide">
        Memo
        <textarea
          rows={16}
          maxLength={50000}
          className="field-sizing-content min-h-96 md:min-h-[60vh]"
          disabled={busy}
          value={form.memo}
          onChange={(event) => onPatch({ memo: event.target.value })}
        />
      </label>
      {form.memo.trim() && (
        <section className="memo-preview wide" aria-label="Memo preview">
          <h3>Preview</h3>
          <Memo text={form.memo} />
        </section>
      )}
      <p className="duration wide" aria-live="polite">
        Study time <strong>{minutes === undefined ? '—' : formatMinutes(minutes)}</strong>
        {crossesMidnight(form.startTime, form.endTime) ? ' (ends the next day)' : ''}
      </p>
      <div className="actions wide">
        <Button type="submit" disabled={busy}>
          <ButtonSpinner when={action === 'save'} />
          {editing ? 'Save changes' : 'Save'}
        </Button>
        {editing && (
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
