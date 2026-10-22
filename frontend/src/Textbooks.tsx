import React, { useEffect, useState } from 'react';
import { requestJson, type RequestError } from './api';
import { Exercises } from './Exercises';
import { TextbookContents } from './TextbookContents';
import {
  emptyTextbookForm,
  limits,
  textbookMeta,
  type ContentNode,
  type Textbook,
  type TextbookForm,
} from './textbook';

type Notice = { kind: 'status' | 'alert'; text: string } | undefined;

// Same breakpoint as style.css, where the list and detail stack.
const singleColumn = '(max-width: 760px)';

export function Textbooks() {
  const [form, setForm] = useState<TextbookForm>(emptyTextbookForm);
  const [editingId, setEditingId] = useState<number | undefined>(undefined);
  // The unsaved new textbook, restored after an edit is saved or cancelled.
  const [draft, setDraft] = useState<TextbookForm | undefined>(undefined);
  const [books, setBooks] = useState<Textbook[] | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<Notice>(undefined);
  // One request at a time: fields and action buttons are disabled while a save or delete is pending.
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<number | undefined>(undefined);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [reload, setReload] = useState(0);
  // The contents tree the contents card shows, shared with the exercises card.
  const [contents, setContents] = useState<{
    textbookId: number;
    tree?: ContentNode[];
    failed: boolean;
  }>();

  useEffect(() => {
    // A slower, older response must not overwrite the list a newer request returned.
    let current = true;
    requestJson<{ textbooks: Textbook[] }>('/api/textbooks')
      .then((data) => {
        if (!current) return;
        setBooks(data.textbooks);
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

  // The detail follows the list, so a textbook deleted elsewhere disappears on the next reload.
  const selected = books?.find((book) => book.id === selectedId);

  const change = (field: keyof TextbookForm) => (event: { target: { value: string } }) => {
    setNotice(undefined);
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const leaveEdit = () => {
    setForm(draft ?? emptyTextbookForm());
    setDraft(undefined);
    setEditingId(undefined);
  };

  // `id` is the textbook the failed request targeted.
  const fail = (error: RequestError, id?: number) => {
    setNotice({ kind: 'alert', text: error.message });
    // Only a 404 on the textbook being edited ends the edit, so unsaved changes survive otherwise.
    if (error.status === 404 && id !== undefined && id === editingId) leaveEdit();
    setReload((count) => count + 1);
  };

  const save = async (event: { preventDefault(): void }) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const data = await requestJson<{ textbook: Textbook }>(
        editingId === undefined ? '/api/textbooks' : `/api/textbooks/${editingId}`,
        { method: editingId === undefined ? 'POST' : 'PUT', body: form },
      );
      setNotice({
        kind: 'status',
        text: editingId === undefined ? '등록했습니다' : '수정했습니다',
      });
      if (editingId === undefined) setForm(emptyTextbookForm());
      else leaveEdit();
      setSelectedId(data.textbook.id);
      setConfirmingDelete(false);
      setReload((count) => count + 1);
    } catch (error) {
      fail(error as RequestError, editingId);
    } finally {
      setBusy(false);
    }
  };

  const select = (id: number) => {
    setSelectedId(id);
    setConfirmingDelete(false);
    // On a phone the detail sits below the list; bring it into view. Side by side on a wider
    // screen it is already visible, so keyboard focus stays in the list.
    if (globalThis.matchMedia?.(singleColumn).matches)
      document.getElementById('textbook-detail')?.focus?.();
  };

  const edit = (book: Textbook) => {
    if (editingId === undefined) setDraft(form);
    setEditingId(book.id);
    setConfirmingDelete(false);
    setNotice(undefined);
    setForm({ title: book.title, author: book.author, edition: book.edition });
    document.getElementById('textbook-title')?.focus?.();
  };

  const remove = async (id: number) => {
    if (busy) return;
    setBusy(true);
    try {
      await requestJson(`/api/textbooks/${id}`, { method: 'DELETE' });
      setNotice({ kind: 'status', text: '삭제했습니다' });
      if (editingId === id) leaveEdit();
      setSelectedId(undefined);
      setReload((count) => count + 1);
    } catch (error) {
      fail(error as RequestError, id);
    } finally {
      setConfirmingDelete(false);
      setBusy(false);
    }
  };

  return (
    <div className="textbooks">
      <section className="card">
        <h2>{editingId === undefined ? '교재 등록' : '교재 수정'}</h2>
        <form className="log-form textbook-form" onSubmit={save}>
          <label className="title">
            제목
            <input
              id="textbook-title"
              required
              maxLength={limits.title}
              disabled={busy}
              value={form.title}
              onChange={change('title')}
            />
          </label>
          <label>
            저자
            <input
              maxLength={limits.author}
              disabled={busy}
              value={form.author}
              onChange={change('author')}
            />
          </label>
          <label>
            판본
            <input
              maxLength={limits.edition}
              disabled={busy}
              value={form.edition}
              onChange={change('edition')}
            />
          </label>
          <div className="actions wide">
            <button type="submit" className="primary" disabled={busy}>
              {editingId === undefined ? '등록' : '수정 저장'}
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
      <div className="textbook-browser">
        <section className="card">
          <h2>교재 목록</h2>
          {loadError && (
            <p role="alert" className="error">
              교재 목록을 불러오지 못했습니다: {loadError}
            </p>
          )}
          {books === undefined ? (
            !loadError && <p className="status">불러오는 중…</p>
          ) : books.length === 0 ? (
            <p className="status">아직 등록한 교재가 없습니다</p>
          ) : (
            <ul className="log-list">
              {books.map((book) => (
                <li key={book.id} className={book.id === selectedId ? 'editing' : ''}>
                  <button
                    type="button"
                    className="book-title"
                    aria-current={book.id === selectedId ? 'true' : undefined}
                    onClick={() => select(book.id)}
                  >
                    {book.title}
                  </button>
                  {textbookMeta(book) && <span className="status">{textbookMeta(book)}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card" id="textbook-detail" tabIndex={-1} aria-label="교재 상세">
          <h2>교재 상세</h2>
          {selected === undefined ? (
            <p className="status">목록에서 교재를 선택하세요</p>
          ) : (
            <>
              <dl className="detail">
                <div>
                  <dt>제목</dt>
                  <dd>{selected.title}</dd>
                </div>
                <div>
                  <dt>저자</dt>
                  <dd>{selected.author || '—'}</dd>
                </div>
                <div>
                  <dt>판본</dt>
                  <dd>{selected.edition || '—'}</dd>
                </div>
              </dl>
              <div className="log-actions">
                {confirmingDelete ? (
                  <>
                    <button
                      type="button"
                      className="danger"
                      disabled={busy}
                      aria-label={`${selected.title} 교재 삭제 확인`}
                      onClick={() => remove(selected.id)}
                    >
                      삭제 확인
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      aria-label={`${selected.title} 교재 삭제 취소`}
                      onClick={() => setConfirmingDelete(false)}
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
                      aria-label={`${selected.title} 교재 수정`}
                      onClick={() => edit(selected)}
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      aria-label={`${selected.title} 교재 삭제`}
                      onClick={() => setConfirmingDelete(true)}
                    >
                      삭제
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </section>
      </div>
      {selected && (
        <section className="card" aria-label={`${selected.title} 목차`}>
          <TextbookContents key={selected.id} textbookId={selected.id} onTree={setContents} />
        </section>
      )}
      {selected && (
        <section className="card" aria-label={`${selected.title} 연습문제`}>
          <Exercises
            key={selected.id}
            textbook={selected}
            tree={contents?.textbookId === selected.id ? contents.tree : undefined}
            treeFailed={contents?.textbookId === selected.id && contents.failed}
          />
        </section>
      )}
    </div>
  );
}
