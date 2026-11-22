import { ButtonSpinner } from './loading';
import { Memo } from './memo';
import {
  formatMinutes,
  reflectionLabel,
  statusLabels,
  studiedLabel,
  type StudyLog,
} from './study-logs-data';

const describe = (log: StudyLog) => `${log.studyDate} ${log.startTime}–${log.endTime}`;

// One row of the recent logs: what was studied and how it went, with edit and delete (which asks
// for confirmation first). The parent does the work.
export function StudyLogItem({
  log,
  editing,
  confirming,
  busy,
  action,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  log: StudyLog;
  editing: boolean;
  confirming: boolean;
  busy: boolean;
  action: string | undefined;
  onEdit: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  return (
    <li className={editing ? 'editing' : ''}>
      <div className="log-head">
        <span className="log-date">{log.studyDate}</span>
        <span>
          {log.startTime}–{log.endTime}
        </span>
        <strong>{formatMinutes(log.durationMinutes)}</strong>
        <span className={`badge ${log.status}`}>{statusLabels[log.status]}</span>
        {log.studyType === 'review' && <span className="badge">Review</span>}
      </div>
      {log.textbookTitle !== null && <p className="log-studied">{studiedLabel(log)}</p>}
      {reflectionLabel(log) && <p className="log-studied">{reflectionLabel(log)}</p>}
      {log.difficulties && <p className="log-memo">Difficult parts: {log.difficulties}</p>}
      {log.memo && <Memo text={log.memo} clamp />}
      <div className="log-actions">
        {confirming ? (
          <>
            <button
              type="button"
              id={`study-log-delete-confirm-${log.id}`}
              className="danger"
              disabled={busy}
              aria-label={`Confirm log deletion: ${describe(log)}`}
              onClick={onDelete}
            >
              <ButtonSpinner when={action === 'delete'} />
              Confirm delete
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              aria-label={`Cancel log deletion: ${describe(log)}`}
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
              disabled={busy}
              aria-label={`Edit log: ${describe(log)}`}
              onClick={onEdit}
            >
              Edit
            </button>
            <button
              type="button"
              id={`study-log-delete-${log.id}`}
              className="secondary"
              disabled={busy}
              aria-label={`Delete log: ${describe(log)}`}
              onClick={onAskDelete}
            >
              Delete
            </button>
          </>
        )}
      </div>
    </li>
  );
}
