import React, { useEffect, useState } from 'react';

import { type RequestError, requestJson } from './api';
import { useBusy } from './busy';
import { Calendar } from './Calendar';
import { Memo } from './Memo';
import {
  crossesMidnight,
  emptyForm,
  formatMinutes,
  previewMinutes,
  reflectionLabel,
  statusLabels,
  studiedLabel,
  type StudyLog,
  type StudyLogForm,
  type StudyStatus,
  understandingLabels,
} from './study-logs';
import { StudyLogSearch } from './StudyLogSearch';
import { type ContentNode, contentOptions, type Textbook } from './textbook';

type Notice = { kind: 'status' | 'alert'; text: string } | undefined;

const recentLimit = 20;

const describe = (log: StudyLog) => `${log.studyDate} ${log.startTime}–${log.endTime}`;

// `onChange` hears each save or delete attempt, since either can change which reviews are due.
export function StudyLogs({ today, onChange }: { today: string; onChange?: () => void }) {
  const [form, setForm] = useState<StudyLogForm>(() => emptyForm(today));
  const [editingId, setEditingId] = useState<number | undefined>(undefined);
  // The unsaved new entry, restored after an edit is saved or cancelled.
  const [draft, setDraft] = useState<StudyLogForm | undefined>(undefined);
  const [logs, setLogs] = useState<StudyLog[] | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<Notice>(undefined);
  // One request at a time: fields and action buttons are disabled while a save or delete is pending.
  const { busy, begin, end } = useBusy();
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

  useEffect(() => {
    // A slower, older response must not overwrite the list a newer request returned.
    let current = true;
    requestJson<{ studyLogs: StudyLog[] }>(`/api/study-logs?limit=${recentLimit}`)
      .then((data) => {
        if (!current) return;
        setLogs(data.studyLogs);
        setLoadError(undefined);
      })
      .catch((error: RequestError) => {
        // Keep whatever list is already on screen; only report that it could not be refreshed.
        if (current) setLoadError(error.message);
      });
    return () => {
      current = false;
    };
  }, [reload]);

  // Textbooks to link a log to. Without them the log is simply saved unlinked.
  const [textbooks, setTextbooks] = useState<Textbook[]>([]);
  useEffect(() => {
    let current = true;
    requestJson<{ textbooks: Textbook[] }>('/api/textbooks')
      .then((data) => current && setTextbooks(data.textbooks))
      .catch(() => current && setTextbooks([]));
    return () => {
      current = false;
    };
  }, []);

  // Chapters of the selected textbook, flattened for the select. Kept with the textbook they
  // belong to, so a previous textbook's chapters never show while the new ones load.
  const [loadedChapters, setLoadedChapters] = useState<{
    textbookId: number;
    options: { id: number; label: string }[];
  }>();
  useEffect(() => {
    const textbookId = form.textbookId;
    if (textbookId === null) return;
    let current = true;
    requestJson<{ contents: ContentNode[] }>(`/api/textbooks/${textbookId}/contents`)
      .then(
        (data) =>
          current && setLoadedChapters({ textbookId, options: contentOptions(data.contents) }),
      )
      .catch(() => current && setLoadedChapters({ textbookId, options: [] }));
    return () => {
      current = false;
    };
  }, [form.textbookId]);
  const chapters = loadedChapters?.textbookId === form.textbookId ? loadedChapters.options : [];

  const minutes = previewMinutes(form.startTime, form.endTime);
  const change = (field: keyof StudyLogForm) => (event: { target: { value: string } }) => {
    setNotice(undefined);
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  // The select values '', '1'…'5', 'true' and 'false' map to null, a number and a boolean.
  const assess =
    (field: 'understanding' | 'goalAchieved') => (event: { target: { value: string } }) => {
      setNotice(undefined);
      const { value } = event.target;
      const parsed =
        value === '' ? null : field === 'understanding' ? Number(value) : value === 'true';
      setForm((current) => ({ ...current, [field]: parsed }));
    };

  // Picking another textbook clears the chapter, which belonged to the previous one.
  const pick = (field: 'textbookId' | 'contentId') => (event: { target: { value: string } }) => {
    setNotice(undefined);
    const id = event.target.value === '' ? null : Number(event.target.value);
    setForm((current) =>
      field === 'textbookId'
        ? { ...current, textbookId: id, contentId: null }
        : { ...current, contentId: id },
    );
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
    setReload((count) => count + 1);
  };

  const save = async (event: { preventDefault(): void }) => {
    event.preventDefault();
    if (!begin()) return;
    try {
      await requestJson(
        editingId === undefined ? '/api/study-logs' : `/api/study-logs/${editingId}`,
        {
          method: editingId === undefined ? 'POST' : 'PUT',
          body: form,
        },
      );
      setNotice({
        kind: 'status',
        text: editingId === undefined ? '저장했습니다' : '수정했습니다',
      });
      // A new entry keeps its date for the next session of the same day.
      if (editingId === undefined) setForm(emptyForm(form.studyDate));
      else leaveEdit();
      setReload((count) => count + 1);
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
    });
    // On a phone the form sits above the list; bring it into view.
    document.getElementById('study-log-date')?.focus?.();
  };

  const remove = async (id: number) => {
    if (!begin()) return;
    try {
      await requestJson(`/api/study-logs/${id}`, { method: 'DELETE' });
      setNotice({ kind: 'status', text: '삭제했습니다' });
      if (editingId === id) leaveEdit();
      setReload((count) => count + 1);
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
        <h2>{editingId === undefined ? '학습 기록 입력' : '학습 기록 수정'}</h2>
        <form className="log-form" onSubmit={(event) => void save(event)}>
          <label>
            학습일
            <input
              id="study-log-date"
              type="date"
              required
              disabled={busy}
              value={form.studyDate}
              onChange={change('studyDate')}
            />
          </label>
          <label>
            시작
            <input
              type="time"
              required
              disabled={busy}
              value={form.startTime}
              onChange={change('startTime')}
            />
          </label>
          <label>
            종료
            <input
              type="time"
              required
              disabled={busy}
              value={form.endTime}
              onChange={change('endTime')}
            />
          </label>
          <label>
            상태
            <select disabled={busy} value={form.status} onChange={change('status')}>
              {(Object.keys(statusLabels) as StudyStatus[]).map((status) => (
                <option key={status} value={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </select>
          </label>
          <label className="half">
            교재
            <select disabled={busy} value={form.textbookId ?? ''} onChange={pick('textbookId')}>
              <option value="">선택 안 함</option>
              {textbooks.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.title}
                </option>
              ))}
            </select>
          </label>
          <label className="half">
            장/절
            <select
              disabled={busy || form.textbookId === null}
              value={form.contentId ?? ''}
              onChange={pick('contentId')}
            >
              <option value="">
                {form.textbookId === null ? '교재를 먼저 선택' : '선택 안 함'}
              </option>
              {chapters.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>
                  {chapter.label}
                </option>
              ))}
            </select>
          </label>
          <label className="half">
            이해도
            <select
              disabled={busy}
              value={form.understanding ?? ''}
              onChange={assess('understanding')}
            >
              <option value="">선택 안 함</option>
              {Object.entries(understandingLabels).map(([score, label]) => (
                <option key={score} value={score}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="half">
            목표 달성
            <select
              disabled={busy}
              value={form.goalAchieved === null ? '' : String(form.goalAchieved)}
              onChange={assess('goalAchieved')}
            >
              <option value="">선택 안 함</option>
              <option value="true">달성</option>
              <option value="false">미달성</option>
            </select>
          </label>
          <label className="wide">
            어려웠던 부분
            <textarea
              rows={2}
              maxLength={2000}
              disabled={busy}
              value={form.difficulties}
              onChange={change('difficulties')}
            />
          </label>
          <label className="wide">
            메모
            <textarea
              rows={3}
              maxLength={10000}
              disabled={busy}
              value={form.memo}
              onChange={change('memo')}
              aria-describedby="memo-hint"
            />
          </label>
          <p id="memo-hint" className="hint wide">
            마크다운을 쓸 수 있습니다: # 제목, - 목록, **굵게**, `코드`, [링크](주소)
          </p>
          {form.memo.trim() && (
            <section className="memo-preview wide" aria-label="메모 미리보기">
              <h3>미리보기</h3>
              <Memo text={form.memo} />
            </section>
          )}
          <p className="duration wide" aria-live="polite">
            학습 시간 <strong>{minutes === undefined ? '—' : formatMinutes(minutes)}</strong>
            {crossesMidnight(form.startTime, form.endTime) ? ' (다음 날 종료)' : ''}
          </p>
          <div className="actions wide">
            <button type="submit" className="primary" disabled={busy}>
              {editingId === undefined ? '저장' : '수정 저장'}
            </button>
            {editingId !== undefined && (
              <button type="button" className="secondary" disabled={busy} onClick={leaveEdit}>
                취소
              </button>
            )}
          </div>
        </form>
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
          최근 기록
        </h2>
        {loadError && (
          <p role="alert" className="error">
            최근 기록을 불러오지 못했습니다: {loadError}
          </p>
        )}
        {logs === undefined ? (
          !loadError && <p className="status">불러오는 중…</p>
        ) : logs.length === 0 ? (
          <p className="status">아직 학습 기록이 없습니다</p>
        ) : (
          <ul className="log-list">
            {logs.map((log) => (
              <li key={log.id} className={log.id === editingId ? 'editing' : ''}>
                <div className="log-head">
                  <span className="log-date">{log.studyDate}</span>
                  <span>
                    {log.startTime}–{log.endTime}
                  </span>
                  <strong>{formatMinutes(log.durationMinutes)}</strong>
                  <span className={`badge ${log.status}`}>{statusLabels[log.status]}</span>
                </div>
                {log.textbookTitle !== null && <p className="log-studied">{studiedLabel(log)}</p>}
                {reflectionLabel(log) && <p className="log-studied">{reflectionLabel(log)}</p>}
                {log.difficulties && <p className="log-memo">어려웠던 부분: {log.difficulties}</p>}
                {log.memo && <Memo text={log.memo} clamp />}
                <div className="log-actions">
                  {deletingId === log.id ? (
                    <>
                      <button
                        type="button"
                        id={`study-log-delete-confirm-${log.id}`}
                        className="danger"
                        disabled={busy}
                        aria-label={`${describe(log)} 기록 삭제 확인`}
                        onClick={() => void remove(log.id)}
                      >
                        삭제 확인
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        aria-label={`${describe(log)} 기록 삭제 취소`}
                        onClick={() => {
                          setDeletingId(undefined);
                          setWantFocus(`study-log-delete-${log.id}`);
                        }}
                      >
                        취소
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        aria-label={`${describe(log)} 기록 수정`}
                        onClick={() => edit(log)}
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        id={`study-log-delete-${log.id}`}
                        className="secondary"
                        disabled={busy}
                        aria-label={`${describe(log)} 기록 삭제`}
                        onClick={() => {
                          setDeletingId(log.id);
                          setWantFocus(`study-log-delete-confirm-${log.id}`);
                        }}
                      >
                        삭제
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <StudyLogSearch textbooks={textbooks} reloadKey={reload} />
      <Calendar today={today} reloadKey={reload} />
    </div>
  );
}
