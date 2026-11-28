import { Button } from './components/ui/button';
import { DeleteConfirm } from './delete-confirm';
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
  onEdit,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  log: StudyLog;
  editing: boolean;
  confirming: boolean;
  busy: boolean;
  onEdit: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => Promise<unknown>;
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
      {log.memo && <Memo text={log.memo} clamp />}
      <div className="log-actions">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          aria-label={`Edit log: ${describe(log)}`}
          onClick={onEdit}
        >
          Edit
        </Button>
        <Button
          type="button"
          id={`study-log-delete-${log.id}`}
          variant="outline"
          disabled={busy}
          aria-label={`Delete log: ${describe(log)}`}
          onClick={onAskDelete}
        >
          Delete
        </Button>
        <DeleteConfirm
          open={confirming}
          title="Delete this study log?"
          description={describe(log)}
          onConfirm={onDelete}
          onCancel={onCancelDelete}
        />
      </div>
    </li>
  );
}
