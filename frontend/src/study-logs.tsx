import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useBusy } from './busy';
import type { RequestError } from './lib/api';
import { apiKey, useApiMutation, useApiQuery } from './lib/query';
import { StudyLogFormView } from './study-log-form';
import { emptyForm, type StudyLog, type StudyLogForm } from './study-logs-data';
import { type ContentNode, contentOptions, type Textbook } from './textbook';

type Notice = { kind: 'status' | 'alert'; text: string } | undefined;

// The Study log page: the entry form only (the recent list, search and calendar are on the History
// page, #478). `editId` opens the form with that log; `onEditEnd` hears when the edit is saved,
// cancelled or no longer possible. `onChange` hears each save attempt, since it can change which
// reviews are due.
export function StudyLogs({
  today,
  onChange,
  editId,
  onEditEnd,
}: {
  today: string;
  onChange?: () => void;
  editId?: number;
  onEditEnd?: () => void;
}) {
  const [form, setForm] = useState<StudyLogForm>(() => emptyForm(today));
  const [editingId, setEditingId] = useState<number | undefined>(undefined);
  // The unsaved new entry, restored after an edit is saved or cancelled.
  const [draft, setDraft] = useState<StudyLogForm | undefined>(undefined);
  const [notice, setNotice] = useState<Notice>(undefined);
  // One request at a time: fields and action buttons are disabled while a save or delete is pending.
  const { busy, action, nameNext, begin, end } = useBusy();

  const client = useQueryClient();

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

  // The History page reads its list again the next time it opens.
  const reloadAll = () => {
    void client.invalidateQueries({ queryKey: apiKey('/api/study-logs') });
  };

  const saveLog = useApiMutation<unknown, { id?: number; body: StudyLogForm }>(({ id, body }) => ({
    path: id === undefined ? '/api/study-logs' : `/api/study-logs/${id}`,
    method: id === undefined ? 'POST' : 'PUT',
    body,
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
    onEditEnd?.();
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
    document.getElementById('study-log-date')?.focus?.();
  };

  // The log to edit comes from the address of the Study log page (`?edit=<id>`), so it is read from
  // the server instead of a list on this page. It fills the form once per id.
  const target = useApiQuery<{ studyLog: StudyLog }>(
    apiKey('/api/study-logs', 'one', editId),
    `/api/study-logs/${editId}`,
    { enabled: editId !== undefined, staleTime: 0 },
  );
  const loaded = useRef<number | undefined>(undefined);
  const loadedLog = target.data?.studyLog;
  useEffect(() => {
    if (editId === undefined) {
      loaded.current = undefined;
      return;
    }
    if (!loadedLog || loadedLog.id !== editId || loaded.current === editId) return;
    loaded.current = editId;
    edit(loadedLog);
    // `edit` only reads state that is current when a log arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, loadedLog]);
  const loadFailure = editId !== undefined && !loadedLog ? target.error : null;

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
        {loadFailure && (
          <p role="alert" className="error">
            Could not load the study log to edit: {loadFailure.message}
          </p>
        )}
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
    </div>
  );
}
