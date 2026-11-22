import { ButtonSpinner } from './loading';
import { dayLabel, type ScheduleDetail } from './schedule';
import { formatMinutes } from './study-logs-data';
import { contentLabel } from './textbook';

// The day being moved, and where to.
export type Moving = { id: number; date: string; withLater: boolean };

// The days of the shown schedule (#35): a check box per day, and a button that opens a form to move
// that day (alone or with the later ones). The parent holds the state and sends the changes.
export function ScheduleDays({
  detail,
  names,
  today,
  moving,
  busy,
  action,
  onToggle,
  onStartMove,
  onChangeMove,
  onCancelMove,
  onMove,
}: {
  detail: ScheduleDetail;
  names: Map<number, string>;
  today: string;
  moving: Moving | undefined;
  busy: boolean;
  action: string | undefined;
  onToggle: (dayId: number, done: boolean) => void;
  onStartMove: (target: Moving) => void;
  onChangeMove: (target: Moving) => void;
  onCancelMove: (dayId: number) => void;
  onMove: (target: Moving) => void;
}) {
  return (
    <ul className="schedule-days" aria-label="Target time by date">
      {detail.items.map((item) => (
        <li
          key={item.id}
          aria-current={item.date === today ? 'date' : undefined}
          className={item.completedOn ? 'done' : undefined}
        >
          <input
            type="checkbox"
            id={`schedule-day-check-${item.id}`}
            aria-label={`Complete day: ${names.get(item.id)}`}
            checked={item.completedOn !== null}
            disabled={busy}
            onChange={() => onToggle(item.id, item.completedOn !== null)}
          />
          <span className="schedule-day">
            <span>{dayLabel(item.date, detail.schedule.startDate)}</span>
            {item.contents.length > 0 && (
              <span className="status">{item.contents.map(contentLabel).join(' · ')}</span>
            )}
          </span>
          <strong>{formatMinutes(item.targetMinutes)}</strong>
          {!item.completedOn && moving?.id !== item.id && (
            <button
              type="button"
              id={`schedule-day-move-${item.id}`}
              className="secondary"
              aria-label={`Move day: ${names.get(item.id)}`}
              disabled={busy}
              onClick={() => onStartMove({ id: item.id, date: item.date, withLater: false })}
            >
              Move
            </button>
          )}
          {moving?.id === item.id && !item.completedOn && (
            <form
              className="schedule-move"
              aria-label={`Move day: ${names.get(item.id)}`}
              onSubmit={(event) => {
                event.preventDefault();
                onMove(moving);
              }}
            >
              <label>
                Move to
                <input
                  type="date"
                  id={`schedule-day-date-${item.id}`}
                  required
                  min={today}
                  disabled={busy}
                  value={moving.date}
                  onChange={(event) => onChangeMove({ ...moving, date: event.target.value })}
                />
              </label>
              <label className="schedule-later">
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={moving.withLater}
                  onChange={(event) => onChangeMove({ ...moving, withLater: event.target.checked })}
                />
                Move later days too
              </label>
              <div className="actions">
                <button type="submit" className="primary" disabled={busy}>
                  <ButtonSpinner when={action === 'move'} />
                  Move
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => onCancelMove(item.id)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
