import { Button } from './components/ui/button';
import { ButtonSpinner, Loading } from './loading';
import { plural } from './plural';
import type { Schedule } from './schedule';
import type { Notice } from './schedule-create-form';
import { formatMinutes } from './study-logs-data';

// "My schedules" (#35): the list with its message, the schedule shown, and the delete button with
// its confirmation. The parent does the work; this only shows the rows and says what was pressed.
export function ScheduleList({
  schedules,
  listError,
  listNotice,
  shownId,
  confirming,
  busy,
  action,
  onPick,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  schedules: Schedule[] | undefined;
  listError: string | undefined;
  listNotice: Notice;
  shownId: number | undefined;
  confirming: number | undefined;
  busy: boolean;
  action: string | undefined;
  onPick: (id: number) => void;
  onAskDelete: (id: number) => void;
  onCancelDelete: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <section className="card" aria-label="My schedules">
      <h2 id="schedules-heading" tabIndex={-1}>
        My schedules
      </h2>
      {/* Above the rows: a long list would put it out of sight. */}
      <p role="status" className="status">
        {listNotice?.kind === 'status' ? listNotice.text : ''}
      </p>
      {listNotice?.kind === 'alert' && (
        <p role="alert" className="error">
          {listNotice.text}
        </p>
      )}
      {listError && (
        <p role="alert" className="error">
          Could not load the schedules: {listError}
        </p>
      )}
      {schedules === undefined ? (
        !listError && <Loading label="Loading the schedules" />
      ) : schedules.length === 0 ? (
        <p className="status">No schedules yet</p>
      ) : (
        <ul className="log-list">
          {schedules.map((item) => (
            <li key={item.id}>
              <div className="log-head">
                <button
                  type="button"
                  className="book-title"
                  disabled={busy}
                  aria-current={item.id === shownId ? 'true' : undefined}
                  onClick={() => onPick(item.id)}
                >
                  {item.title}
                </button>
                <div className="actions">
                  {confirming === item.id ? (
                    <>
                      <Button
                        type="button"
                        id={`schedule-delete-confirm-${item.id}`}
                        variant="destructive"
                        aria-label={`Confirm deletion: ${item.title}`}
                        disabled={busy}
                        onClick={() => onDelete(item.id)}
                      >
                        <ButtonSpinner when={action === 'delete'} />
                        Confirm delete
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        aria-label={`Cancel deletion: ${item.title}`}
                        disabled={busy}
                        onClick={() => onCancelDelete(item.id)}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      id={`schedule-delete-${item.id}`}
                      variant="outline"
                      aria-label={`Delete schedule: ${item.title}`}
                      disabled={busy}
                      onClick={() => onAskDelete(item.id)}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </div>
              <p className="status">
                {item.textbookTitle && `${item.textbookTitle} · `}
                {item.startDate} ~ {item.endDate}
                {item.delayDays > 0 && ` (${plural(item.delayDays, 'day')} late)`} · progress{' '}
                {item.progressPercent}% · goal {formatMinutes(item.totalMinutes)} ·{' '}
                {plural(item.itemCount, 'day')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
