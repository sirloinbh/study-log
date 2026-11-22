import { ButtonSpinner } from './loading';
import { plural } from './plural';
import type { ScheduleDetail } from './schedule';
import type { Notice } from './schedule-create-form';
import { formatMinutes } from './study-logs-data';

// The schedule whose name is being changed, the name typed and why it was refused (#179).
export type Renaming = { id: number; title: string; error?: string };

// The top of the schedule shown (#35): its name (or the form that renames it), the textbook, the
// progress, the goal summary and the message about the days. The days themselves are the children.
export function ScheduleDetailView({
  detail,
  renaming,
  dayNotice,
  busy,
  action,
  onStartRename,
  onChangeRename,
  onCancelRename,
  onRename,
  children,
}: {
  detail: ScheduleDetail;
  renaming: Renaming | undefined;
  dayNotice: Notice;
  busy: boolean;
  action: string | undefined;
  onStartRename: () => void;
  onChangeRename: (renaming: Renaming) => void;
  onCancelRename: () => void;
  onRename: (renaming: Renaming) => void;
  children: React.ReactNode;
}) {
  const { schedule } = detail;
  return (
    <>
      {renaming?.id === schedule.id ? (
        <form
          className="schedule-rename"
          aria-label="Edit schedule name"
          onSubmit={(event) => {
            event.preventDefault();
            onRename(renaming);
          }}
        >
          <label>
            New schedule name
            <input
              id="schedule-rename-input"
              required
              disabled={busy}
              value={renaming.title}
              aria-invalid={renaming.error ? 'true' : undefined}
              aria-describedby={renaming.error ? 'schedule-rename-error' : undefined}
              onChange={(event) =>
                onChangeRename({ ...renaming, title: event.target.value, error: undefined })
              }
            />
          </label>
          <div className="actions">
            <button type="submit" className="primary" disabled={busy}>
              <ButtonSpinner when={action === 'rename'} />
              Save name
            </button>
            <button
              type="button"
              className="secondary"
              aria-label="Cancel renaming"
              disabled={busy}
              onClick={onCancelRename}
            >
              Cancel
            </button>
          </div>
          {/* Right under the name, apart from what the days say. */}
          {renaming.error && (
            <p id="schedule-rename-error" role="alert" className="error">
              {renaming.error}
            </p>
          )}
        </form>
      ) : (
        <div className="log-head">
          <h2 id="schedule-heading" tabIndex={-1}>
            {schedule.title}
          </h2>
          <button
            type="button"
            id="schedule-rename"
            className="secondary"
            aria-label={`Rename schedule: ${schedule.title}`}
            disabled={busy}
            onClick={onStartRename}
          >
            Rename
          </button>
        </div>
      )}
      {schedule.textbookTitle && <p className="status schedule-book">{schedule.textbookTitle}</p>}
      <div className="schedule-progress">
        <p>
          Progress <strong>{schedule.progressPercent}%</strong>
          <span className="status">
            {formatMinutes(schedule.completedMinutes)} / {formatMinutes(schedule.totalMinutes)} ·{' '}
            {schedule.completedCount} / {plural(schedule.itemCount, 'day')}
          </span>
        </p>
        <div
          role="progressbar"
          aria-label="Schedule progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={schedule.progressPercent}
        >
          <div style={{ width: `${schedule.progressPercent}%` }} />
        </div>
      </div>
      <dl className="retro-summary" aria-label="Schedule summary">
        <div>
          <dt>Weekdays</dt>
          <dd>{formatMinutes(schedule.weekdayMinutes)}</dd>
        </div>
        <div>
          <dt>Weekends and holidays</dt>
          <dd>{formatMinutes(schedule.restDayMinutes)}</dd>
        </div>
        <div>
          <dt>Total goal</dt>
          <dd>{formatMinutes(schedule.totalMinutes)}</dd>
        </div>
        <div>
          <dt>Study days</dt>
          <dd>{schedule.itemCount}</dd>
        </div>
      </dl>
      {schedule.delayDays > 0 && (
        <p className="status">
          Ends on {schedule.currentEndDate}, {plural(schedule.delayDays, 'day')} after the
          originally planned end date {schedule.endDate}
        </p>
      )}
      <p role="status" className="status">
        {dayNotice?.kind === 'status' ? dayNotice.text : ''}
      </p>
      {dayNotice?.kind === 'alert' && (
        <p role="alert" className="error">
          {dayNotice.text}
        </p>
      )}
      {children}
    </>
  );
}
