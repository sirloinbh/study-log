import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';

import { useBusy } from './busy';
import { Calendar } from './calendar';
import type { RequestError } from './lib/api';
import { apiKey, useApiMutation, useApiQuery } from './lib/query';
import { Loading } from './loading';
import { StudyLogItem } from './study-log-item';
import { StudyLogSearch } from './study-log-search';
import type { StudyLog } from './study-logs-data';
import type { Textbook } from './textbook';

type Notice = { kind: 'status' | 'alert'; text: string } | undefined;

const recentLimit = 20;

// The History page (#478): the recent logs with edit and delete, the study log search and the
// calendar. Editing a log opens the Study log page form with that log (`onEdit` gets its id).
// `onChange` hears each delete attempt, since it can change which reviews are due.
export function StudyHistory({
  today,
  onEdit,
  onChange,
}: {
  today: string;
  onEdit: (id: number) => void;
  onChange?: () => void;
}) {
  const [notice, setNotice] = useState<Notice>(undefined);
  // One request at a time: action buttons are disabled while a delete is pending.
  const { busy, nameNext, begin, end } = useBusy();
  const [deletingId, setDeletingId] = useState<number | undefined>(undefined);
  // Tells the calendar and the search to read again after a delete.
  const [reload, setReload] = useState(0);

  // The element to focus once the delete flow has re-rendered and the buttons are enabled again:
  // the confirm button, the delete button after a cancel, or the list heading once the entry is
  // gone (#65). Without it focus falls to the page when the focused button is swapped out.
  const [wantFocus, setWantFocus] = useState<string>();
  useEffect(() => {
    if (!wantFocus || busy) return;
    setWantFocus(undefined);
    document.getElementById(wantFocus)?.focus?.();
  }, [wantFocus, busy]);

  // The recent list. A failed refresh keeps whatever list is on screen and only reports that it could not
  // be refreshed; the error is hidden while a retry runs.
  const client = useQueryClient();
  const recentKey = apiKey('/api/study-logs', 'recent');
  const recent = useApiQuery<{ studyLogs: StudyLog[] }>(
    recentKey,
    `/api/study-logs?limit=${recentLimit}`,
  );
  const logs = recent.data?.studyLogs;
  const loadError = recent.isFetching ? undefined : recent.error?.message;

  // Textbooks for the search filter. Without them the filter simply has no choices.
  const textbooksQuery = useApiQuery<{ textbooks: Textbook[] }>(
    apiKey('/api/textbooks'),
    '/api/textbooks',
  );
  const textbooks = textbooksQuery.data?.textbooks ?? [];

  const reloadAll = () => {
    void client.invalidateQueries({ queryKey: recentKey });
    setReload((count) => count + 1);
  };

  const deleteLog = useApiMutation<unknown, number>((id) => ({
    path: `/api/study-logs/${id}`,
    method: 'DELETE',
  }));

  const remove = async (id: number) => {
    nameNext('delete');
    if (!begin()) return;
    try {
      await deleteLog.mutateAsync(id);
      setNotice({ kind: 'status', text: 'Deleted' });
      reloadAll();
      setWantFocus('study-log-list');
    } catch (error) {
      setNotice({ kind: 'alert', text: (error as RequestError).message });
      // The log may have been deleted elsewhere; show the server's current list.
      reloadAll();
      // Already gone elsewhere: like a delete. Otherwise the entry stays with its delete button.
      setWantFocus(
        (error as RequestError).status === 404 ? 'study-log-list' : `study-log-delete-${id}`,
      );
    } finally {
      setDeletingId(undefined);
      end();
      onChange?.();
    }
  };

  return (
    <div className="study-logs">
      <section className="card">
        <h2 id="study-log-list" tabIndex={-1}>
          Recent logs
        </h2>
        {/* Always mounted so screen readers announce each new message. */}
        <p role="status" className="status">
          {notice?.kind === 'status' ? notice.text : ''}
        </p>
        {notice?.kind === 'alert' && (
          <p role="alert" className="error">
            {notice.text}
          </p>
        )}
        {loadError && (
          <p role="alert" className="error">
            Could not load the recent logs: {loadError}
          </p>
        )}
        {logs === undefined ? (
          !loadError && <Loading label="Loading the recent logs" />
        ) : logs.length === 0 ? (
          <p className="status">No study logs yet</p>
        ) : (
          <ul className="log-list">
            {logs.map((log) => (
              <StudyLogItem
                key={log.id}
                log={log}
                editing={false}
                confirming={deletingId === log.id}
                busy={busy}
                onEdit={() => onEdit(log.id)}
                onAskDelete={() => setDeletingId(log.id)}
                onCancelDelete={() => {
                  setDeletingId(undefined);
                  setWantFocus(`study-log-delete-${log.id}`);
                }}
                onDelete={() => remove(log.id)}
              />
            ))}
          </ul>
        )}
      </section>
      <StudyLogSearch textbooks={textbooks} reloadKey={reload} />
      <Calendar today={today} reloadKey={reload} />
    </div>
  );
}
