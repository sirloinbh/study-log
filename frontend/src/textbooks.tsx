import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';

import { useBusy } from './busy';
import { Button } from './components/ui/button';
import { Combobox } from './components/ui/combobox';
import { Input } from './components/ui/input';
import { DeleteConfirm } from './delete-confirm';
import { Exercises } from './exercises';
import { ImportantExercises } from './important-exercises';
import type { RequestError } from './lib/api';
import { apiKey, type ApiRequest, useApiMutation, useApiQuery } from './lib/query';
import { ButtonSpinner, Loading } from './loading';
import {
  type ContentNode,
  emptyTextbookForm,
  limits,
  type Textbook,
  type TextbookForm,
  textbookMeta,
} from './textbook';
import { TextbookContents } from './textbook-contents';

const textbooksKey = apiKey('/api/textbooks');

type Notice = { kind: 'status' | 'alert'; text: string } | undefined;

// Same breakpoint as style.css, where the list and detail stack.
const singleColumn = '(max-width: 760px)';

export function Textbooks() {
  const [form, setForm] = useState<TextbookForm>(emptyTextbookForm);
  const [editingId, setEditingId] = useState<number | undefined>(undefined);
  // The unsaved new textbook, restored after an edit is saved or cancelled.
  const [draft, setDraft] = useState<TextbookForm | undefined>(undefined);
  const [notice, setNotice] = useState<Notice>(undefined);
  // One request at a time: fields and action buttons are disabled while a save or delete is pending.
  const { busy, action, nameNext, begin, end } = useBusy();
  const [selectedId, setSelectedId] = useState<number | undefined>(undefined);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // The element to focus once the delete flow has re-rendered and the buttons are enabled again:
  // the confirm button, the delete button after a cancel, or the list heading once the entry is
  // gone (#65). Without it focus falls to the page when the focused button is swapped out.
  const [wantFocus, setWantFocus] = useState<string>();
  useEffect(() => {
    if (!wantFocus || busy) return;
    setWantFocus(undefined);
    document.getElementById(wantFocus)?.focus?.();
  }, [wantFocus, busy]);
  // The contents tree the contents card shows, shared with the exercises card.
  const [contents, setContents] = useState<{
    textbookId: number;
    tree?: ContentNode[];
    failed: boolean;
  }>();
  // Changes made in each exercise card, so the other one reloads.
  const [exerciseChanges, setExerciseChanges] = useState({ list: 0, important: 0 });
  // Bumped when the exercises card finds its chapter deleted elsewhere: the contents reload.
  const [contentsReload, setContentsReload] = useState(0);
  const changed = (card: 'list' | 'important') => () =>
    setExerciseChanges((counts) => ({ ...counts, [card]: counts[card] + 1 }));

  // The list is read again after a change (and after a failed one, which may mean it is out of date).
  // A failed read keeps the list on screen and only reports that it could not be refreshed.
  const client = useQueryClient();
  const listQuery = useApiQuery<{ textbooks: Textbook[] }>(textbooksKey, '/api/textbooks');
  const books = listQuery.data?.textbooks;
  // Authors and editions already used are offered as suggestions; a new value can still be typed.
  const used = (field: 'author' | 'edition') => [
    ...new Set((books ?? []).map((book) => book[field].trim()).filter(Boolean)),
  ];
  const loadError = listQuery.error?.message;
  const write = useApiMutation<unknown, ApiRequest>((request) => request);
  const reload = () => void client.invalidateQueries({ queryKey: textbooksKey });

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
    reload();
  };

  const save = async (event: { preventDefault(): void }) => {
    event.preventDefault();
    nameNext('save');
    if (!begin()) return;
    try {
      const data = (await write.mutateAsync({
        path: editingId === undefined ? '/api/textbooks' : `/api/textbooks/${editingId}`,
        method: editingId === undefined ? 'POST' : 'PUT',
        body: form,
      })) as { textbook: Textbook };
      setNotice({
        kind: 'status',
        text: editingId === undefined ? 'Registered' : 'Updated',
      });
      if (editingId === undefined) setForm(emptyTextbookForm());
      else leaveEdit();
      setSelectedId(data.textbook.id);
      setConfirmingDelete(false);
      reload();
    } catch (error) {
      fail(error as RequestError, editingId);
    } finally {
      end();
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
    nameNext('delete');
    if (!begin()) return;
    try {
      await write.mutateAsync({ path: `/api/textbooks/${id}`, method: 'DELETE' });
      setNotice({ kind: 'status', text: 'Deleted' });
      if (editingId === id) leaveEdit();
      setSelectedId(undefined);
      reload();
      setWantFocus('textbook-list');
    } catch (error) {
      fail(error as RequestError, id);
      // Already gone elsewhere: like a delete. Otherwise the detail stays with its delete button.
      setWantFocus((error as RequestError).status === 404 ? 'textbook-list' : 'textbook-delete');
    } finally {
      setConfirmingDelete(false);
      end();
    }
  };

  return (
    <div className="textbooks">
      <section className="card">
        <h2>{editingId === undefined ? 'Register a textbook' : 'Edit the textbook'}</h2>
        <form className="log-form textbook-form" onSubmit={(event) => void save(event)}>
          <label className="title">
            Title
            <Input
              id="textbook-title"
              required
              maxLength={limits.title}
              disabled={busy}
              value={form.title}
              onChange={change('title')}
            />
          </label>
          <div className="combo-field">
            <label htmlFor="textbook-author">Author</label>
            <Combobox
              id="textbook-author"
              maxLength={limits.author}
              disabled={busy}
              value={form.author}
              onValueChange={(value) => change('author')({ target: { value } })}
              options={used('author')}
              listLabel="Authors already used"
            />
          </div>
          <div className="combo-field">
            <label htmlFor="textbook-edition">Edition</label>
            <Combobox
              id="textbook-edition"
              maxLength={limits.edition}
              disabled={busy}
              value={form.edition}
              onValueChange={(value) => change('edition')({ target: { value } })}
              options={used('edition')}
              listLabel="Editions already used"
            />
          </div>
          <div className="actions wide">
            <Button type="submit" disabled={busy}>
              <ButtonSpinner when={action === 'save'} />
              {editingId === undefined ? 'Register' : 'Save changes'}
            </Button>
            {editingId !== undefined && (
              <Button type="button" variant="outline" disabled={busy} onClick={leaveEdit}>
                Cancel
              </Button>
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
          <h2 id="textbook-list" tabIndex={-1}>
            Textbook list
          </h2>
          {loadError && (
            <p role="alert" className="error">
              Could not load the textbooks: {loadError}
            </p>
          )}
          {books === undefined ? (
            !loadError && <Loading label="Loading the textbooks" />
          ) : books.length === 0 ? (
            <p className="status">No textbooks registered yet</p>
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
        <section className="card" id="textbook-detail" tabIndex={-1} aria-label="Textbook details">
          <h2>Textbook details</h2>
          {selected === undefined ? (
            <p className="status">Choose a textbook from the list</p>
          ) : (
            <>
              <dl className="detail">
                <div>
                  <dt>Title</dt>
                  <dd>{selected.title}</dd>
                </div>
                <div>
                  <dt>Author</dt>
                  <dd>{selected.author || '—'}</dd>
                </div>
                <div>
                  <dt>Edition</dt>
                  <dd>{selected.edition || '—'}</dd>
                </div>
              </dl>
              <div className="log-actions">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  aria-label={`Edit textbook: ${selected.title}`}
                  onClick={() => edit(selected)}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  id="textbook-delete"
                  variant="outline"
                  disabled={busy}
                  aria-label={`Delete textbook: ${selected.title}`}
                  onClick={() => setConfirmingDelete(true)}
                >
                  Delete
                </Button>
                <DeleteConfirm
                  open={confirmingDelete}
                  title="Delete this textbook?"
                  description={selected.title}
                  onConfirm={() => remove(selected.id)}
                  onCancel={() => {
                    setConfirmingDelete(false);
                    setWantFocus('textbook-delete');
                  }}
                />
              </div>
            </>
          )}
        </section>
      </div>
      {selected && (
        <section className="card" aria-label={`${selected.title} contents`}>
          <TextbookContents
            key={selected.id}
            textbookId={selected.id}
            onTree={setContents}
            reloadKey={contentsReload}
          />
        </section>
      )}
      {selected && (
        <section className="card" aria-label={`${selected.title} exercises`}>
          <Exercises
            key={selected.id}
            textbook={selected}
            tree={contents?.textbookId === selected.id ? contents.tree : undefined}
            treeFailed={contents?.textbookId === selected.id && contents.failed}
            reloadKey={exerciseChanges.important}
            onChanged={changed('list')}
            onContentMissing={() => setContentsReload((count) => count + 1)}
          />
        </section>
      )}
      {selected && (
        <section className="card" aria-label={`${selected.title} important problems`}>
          <ImportantExercises
            key={selected.id}
            textbook={selected}
            tree={contents?.textbookId === selected.id ? contents.tree : undefined}
            treeFailed={contents?.textbookId === selected.id && contents.failed}
            reloadKey={exerciseChanges.list}
            onChanged={changed('important')}
          />
        </section>
      )}
    </div>
  );
}
