import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useMemo, useState } from 'react';

import { useBusy } from './busy';
import { Calendar } from './calendar';
import type { RequestError } from './lib/api';
import { apiKey, useApiMutation, useApiQuery } from './lib/query';
import { Loading } from './loading';
import { StudyLogFormView } from './study-log-form';
import { StudyLogItem } from './study-log-item';
import { StudyLogSearch } from './study-log-search';
import { emptyForm, type StudyLog, type StudyLogForm } from './study-logs-data';
import { type ContentNode, contentOptions, type Textbook } from './textbook';

type Notice = { kind: 'status' | 'alert'; text: string } | undefined;

const recentLimit = 20;

// `onChange` hears each save or delete attempt, since either can change which reviews are due.
export function StudyLogs({ today, onChange }: { today: string; onChange?: () => void }) {
  const [form, setForm] = useState<StudyLogForm>(() => emptyForm(today));
  const [editingId, setEditingId] = useState<number | undefined>(undefined);
  // The unsaved new entry, restored after an edit is saved or cancelled.
  const [draft, setDraft] = useState<StudyLogForm | undefined>(undefined);
  const [notice, setNotice] = useState<Notice>(undefined);
  // One request at a time: fields and action buttons are disabled while a save or delete is pending.
  const { busy, action, nameNext, begin, end } = useBusy();
  const [deletingId, setDeletingId] = useState<number | undefined>(undefined);
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

  // Textbooks to link a log to. Without them the log is simply saved unlinked.
  const textbooksQuery = useApiQuery<{ textbooks: Textbook[] }>(
    apiKey('/api/textbooks'),
    '/api/textbooks',
  );
  const textbooks = useMemo(() => textbooksQuery.data?.textbooks ?? [], [textbooksQuery.data]);

  // Chapters of the selected textbook, flattened for the select. One cached list per textbook, so a
  // previous textbook's chapters never show while the new ones load.
  const chaptersQuery = useApiQuery<{ contents: ContentNode[] }>(
    apiKey('/api/textbooks', String(form.textbookId), 'contents'),
    `/api/textbooks/${form.textbookId}/contents`,
    { enabled: form.textbookId !== null },
  );
  const chapters = useMemo(
    () =>
      form.textbookId !== null && chaptersQuery.data
        ? contentOptions(chaptersQuery.data.contents)
        : [],
    [form.textbookId, chaptersQuery.data],
  );

  // Reads the list again and tells the calendar and the search to do the same.
  const reloadAll = () => {
    void client.invalidateQueries({ queryKey: recentKey });
    setReload((count) => count + 1);
  };

  const saveLog = useApiMutation<unknown, { id?: number; body: StudyLogForm }>(({ id, body }) => ({
    path: id === undefined ? '/api/study-logs' : `/api/study-logs/${id}`,
    method: id === undefined ? 'POST' : 'PUT',
    body,
  }));
  const deleteLog = useApiMutation<unknown, number>((id) => ({
    path: `/api/study-logs/${id}`,
    method: 'DELETE',
  }));

  // A change to the form takes back what was said about the last try.
  const patch = (changes: Partial<StudyLogForm>) => {
    setNotice(undefined);
    setForm((current) => ({ ...current, ...changes }));
  };

  const leaveEdit = () => {
    setForm(draft ?? emptyForm(today));
    setDraft(undefined);
    setEditingId(undefined);
  };

  // `id` is the log the failed request targeted.
  const fail = (error: RequestError, id?: number) => {
    setNotice({ kind: 'alert', text: error.message });
    // The log may have been deleted elsewhere; show the server's current list. Only a 404 on the
    // log being edited ends the edit, so unsaved changes to another log survive.
    if (error.status === 404 && id !== undefined && id === editingId) leaveEdit();
    reloadAll();
  };

  const save = async (event: { preventDefault(): void }) => {
    event.preventDefault();
    nameNext('save');
    if (!begin()) return;
    try {
      await saveLog.mutateAsync({ id: editingId, body: form });
      setNotice({
        kind: 'status',
        text: editingId === undefined ? 'Saved' : 'Updated',
      });
      // A new entry keeps its date for the next session of the same day.
      if (editingId === undefined) setForm(emptyForm(form.studyDate));
      else leaveEdit();
      reloadAll();
    } catch (error) {
      fail(error as RequestError, editingId);
    } finally {
      end();
      onChange?.();
    }
  };

  const edit = (log: StudyLog) => {
    if (editingId === undefined) setDraft(form);
    setEditingId(log.id);
    setDeletingId(undefined);
    setNotice(undefined);
    setForm({
      studyDate: log.studyDate,
      startTime: log.startTime,
      endTime: log.endTime,
      memo: log.memo,
      status: log.status,
      textbookId: log.textbookId,
      contentId: log.contentId,
      understanding: log.understanding,
      difficulties: log.difficulties,
      goalAchieved: log.goalAchieved,
      studyType: log.studyType,
    });
    // On a phone the form sits above the list; bring it into view.
    setWantFocus('study-log-date');
  };

  const remove = async (id: number) => {
    nameNext('delete');
    if (!begin()) return;
    try {
      await deleteLog.mutateAsync(id);
      setNotice({ kind: 'status', text: 'Deleted' });
      if (editingId === id) leaveEdit();
      reloadAll();
      setWantFocus('study-log-list');
    } catch (error) {
      fail(error as RequestError, id);
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
        <h2>{editingId === undefined ? 'Add a study log' : 'Edit the study log'}</h2>
        <StudyLogFormView
          form={form}
          editing={editingId !== undefined}
          textbooks={textbooks}
          chapters={chapters}
          busy={busy}
          action={action}
          onPatch={patch}
          onSubmit={(event) => void save(event)}
          onCancel={leaveEdit}
        />
        {/* Always mounted so screen readers announce each new message. */}
        <p role="status" className="status">
          {notice?.kind === 'status' ? notice.text : ''}
        </p>
        {notice?.kind === 'alert' && (
          <p role="alert" className="error">
            {notice.text}
          </p>
        )}
      </section>
      <section className="card">
        <h2 id="study-log-list" tabIndex={-1}>
          Recent logs
        </h2>
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
                editing={log.id === editingId}
                confirming={deletingId === log.id}
                busy={busy}
                onEdit={() => edit(log)}
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
