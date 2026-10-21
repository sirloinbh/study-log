import React, { useEffect, useState } from 'react';
import {
  crossesMidnight,
  emptyForm,
  formatMinutes,
  previewMinutes,
  requestJson,
  statusLabels,
  type StudyLog,
  type StudyLogForm,
  type StudyStatus,
} from './study-logs';

type Notice = { kind: 'status' | 'alert'; text: string } | undefined;

const recentLimit = 20;

export function StudyLogs({ today }: { today: string }) {
  const [form, setForm] = useState<StudyLogForm>(() => emptyForm(today));
  const [editingId, setEditingId] = useState<number | undefined>(undefined);
  const [logs, setLogs] = useState<StudyLog[] | undefined>(undefined);
  const [notice, setNotice] = useState<Notice>(undefined);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | undefined>(undefined);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    requestJson<{ studyLogs: StudyLog[] }>(`/api/study-logs?limit=${recentLimit}`)
      .then((data) => setLogs(data.studyLogs))
      .catch((error: Error) => {
        setLogs([]);
        setNotice({ kind: 'alert', text: error.message });
      });
  }, [reload]);

  const minutes = previewMinutes(form.startTime, form.endTime);
  const change = (field: keyof StudyLogForm) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const reset = () => {
    setForm(emptyForm(form.studyDate));
    setEditingId(undefined);
  };

  const save = async (event: { preventDefault(): void }) => {
    event.preventDefault();
    setSaving(true);
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
      reset();
      setReload((count) => count + 1);
    } catch (error) {
      setNotice({ kind: 'alert', text: (error as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const edit = (log: StudyLog) => {
    setEditingId(log.id);
    setDeletingId(undefined);
    setNotice(undefined);
    setForm({
      studyDate: log.studyDate,
      startTime: log.startTime,
      endTime: log.endTime,
      memo: log.memo,
      status: log.status,
    });
  };

  const remove = async (id: number) => {
    try {
      await requestJson(`/api/study-logs/${id}`, { method: 'DELETE' });
      setNotice({ kind: 'status', text: '삭제했습니다' });
      if (editingId === id) reset();
      setReload((count) => count + 1);
    } catch (error) {
      setNotice({ kind: 'alert', text: (error as Error).message });
    } finally {
      setDeletingId(undefined);
    }
  };

  return (
    <div className="study-logs">
      <section className="card">
        <h2>{editingId === undefined ? '학습 기록 입력' : '학습 기록 수정'}</h2>
        <form className="log-form" onSubmit={save}>
          <label>
            학습일
            <input type="date" required value={form.studyDate} onChange={change('studyDate')} />
          </label>
          <label>
            시작
            <input type="time" required value={form.startTime} onChange={change('startTime')} />
          </label>
          <label>
            종료
            <input type="time" required value={form.endTime} onChange={change('endTime')} />
          </label>
          <label>
            상태
            <select value={form.status} onChange={change('status')}>
              {(Object.keys(statusLabels) as StudyStatus[]).map((status) => (
                <option key={status} value={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </select>
          </label>
          <label className="wide">
            메모
            <textarea rows={3} maxLength={10000} value={form.memo} onChange={change('memo')} />
          </label>
          <p className="duration wide" aria-live="polite">
            학습 시간 <strong>{minutes === undefined ? '—' : formatMinutes(minutes)}</strong>
            {crossesMidnight(form.startTime, form.endTime) ? ' (다음 날 종료)' : ''}
          </p>
          <div className="actions wide">
            <button type="submit" className="primary" disabled={saving}>
              {editingId === undefined ? '저장' : '수정 저장'}
            </button>
            {editingId !== undefined && (
              <button type="button" className="secondary" onClick={reset}>
                취소
              </button>
            )}
          </div>
        </form>
        {notice && (
          <p role={notice.kind} className={notice.kind === 'alert' ? 'error' : 'status'}>
            {notice.text}
          </p>
        )}
      </section>
      <section className="card">
        <h2>최근 기록</h2>
        {logs === undefined ? (
          <p className="status">불러오는 중…</p>
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
                {log.memo && <p className="log-memo">{log.memo}</p>}
                <div className="log-actions">
                  {deletingId === log.id ? (
                    <>
                      <button type="button" className="danger" onClick={() => remove(log.id)}>
                        삭제 확인
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setDeletingId(undefined)}
                      >
                        취소
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="secondary" onClick={() => edit(log)}>
                        수정
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setDeletingId(log.id)}
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
    </div>
  );
}
