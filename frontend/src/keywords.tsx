import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';

import { useBusy } from './busy';
import {
  emptyKeywordForm,
  type Keyword,
  type KeywordForm,
  type KeywordSearch,
  searchPath,
} from './keyword';
import { KeywordFormView } from './keyword-form';
import { KeywordSearchCard } from './keyword-search-card';
import { type RequestError, requestJson } from './lib/api';
import { apiKey, useApiMutation, useApiQuery } from './lib/query';
import { ButtonSpinner, Loading } from './loading';

type Notice = { kind: 'status' | 'alert'; text: string } | undefined;

// An open edit of one keyword; its date can be changed too.
type Editor = { id: number; date: string; form: KeywordForm };

// Keywords of the day (#40): quick entry for a picked date (today by default), that date's list
// with edit and delete, and a search over all dates.
export function Keywords({ today }: { today: string }) {
  const [date, setDate] = useState(today);
  const client = useQueryClient();
  const [form, setForm] = useState<KeywordForm>(emptyKeywordForm);
  const [editor, setEditor] = useState<Editor>();
  const [deletingId, setDeletingId] = useState<number>();
  const [notice, setNotice] = useState<Notice>(undefined);
  // One change at a time, including the reloads after it.
  const { busy, action, nameNext, begin, end } = useBusy();
  // The element to focus once the change is done and the controls are enabled again.
  const [wantFocus, setWantFocus] = useState<string>();
  const [search, setSearch] = useState<KeywordSearch>({ q: '', from: '', to: '' });
  // The last search run and its results; kept until the next search so changes can refresh it.
  const [results, setResults] = useState<{ path: string; keywords: Keyword[] }>();
  const [searchError, setSearchError] = useState<string>();

  // After an add the keyword field takes focus again; after an edit or delete, whose buttons are
  // gone, the day's heading does, so keyboard users keep their place.
  useEffect(() => {
    if (!wantFocus || busy) return;
    setWantFocus(undefined);
    document.getElementById(wantFocus)?.focus?.();
  }, [wantFocus, busy]);

  const dayQuery = useApiQuery<{ keywords: Keyword[] }>(
    apiKey('/api/keywords', 'day', date),
    `/api/keywords?date=${date}`,
    { staleTime: 0 },
  );
  const keywords = dayQuery.data?.keywords;
  const error = dayQuery.isFetching ? undefined : dayQuery.error?.message;

  // A search is a one-off request, not a cached read: its results are re-run by hand after a change.
  const runSearch = async (path: string) => {
    try {
      const data = await requestJson<{ keywords: Keyword[] }>(path);
      setResults({ path, keywords: data.keywords });
      setSearchError(undefined);
    } catch (failure) {
      setSearchError((failure as RequestError).message);
      // Not refreshed later: its results no longer match the query in the form.
      setResults(undefined);
    }
  };

  const create = useApiMutation<unknown, { date: string } & KeywordForm>((body) => ({
    path: '/api/keywords',
    body,
  }));
  const update = useApiMutation<unknown, { id: number; body: { date: string } & KeywordForm }>(
    ({ id, body }) => ({ path: `/api/keywords/${id}`, method: 'PUT', body }),
  );
  const destroy = useApiMutation<unknown, number>((id) => ({
    path: `/api/keywords/${id}`,
    method: 'DELETE',
  }));

  // Runs one change, then reloads the day and the shown search results, all while busy. A 404
  // closes the editor when it is about the keyword being edited.
  const run = async (change: () => Promise<void>, targetId?: number) => {
    if (!begin()) return;
    try {
      await change();
    } catch (failure) {
      const { message, status } = failure as RequestError;
      setNotice({ kind: 'alert', text: message });
      if (status === 404 && targetId !== undefined && targetId === editor?.id) {
        setEditor(undefined);
        setWantFocus('keyword-day');
      }
    } finally {
      await client.invalidateQueries({ queryKey: apiKey('/api/keywords', 'day') });
      if (results) await runSearch(results.path);
      end();
    }
  };

  // A cleared date field is ignored; the list keeps showing the last picked date.
  const pickDate = (event: { target: { value: string } }) => {
    if (!event.target.value) return;
    setDate(event.target.value);
    setEditor(undefined);
    setDeletingId(undefined);
    setNotice(undefined);
  };

  const add = (event: { preventDefault(): void }) => {
    event.preventDefault();
    nameNext('add');
    void run(async () => {
      await create.mutateAsync({ date, ...form });
      setForm(emptyKeywordForm());
      setNotice({ kind: 'status', text: 'Added' });
      setWantFocus('keyword-input');
    });
  };

  const save = (event: { preventDefault(): void }) => {
    event.preventDefault();
    if (!editor) return;
    nameNext('save');
    void run(async () => {
      await update.mutateAsync({ id: editor.id, body: { date: editor.date, ...editor.form } });
      setEditor(undefined);
      setWantFocus('keyword-day');
      setNotice({
        kind: 'status',
        text: editor.date === date ? 'Updated' : `Updated and moved to ${editor.date}`,
      });
    }, editor.id);
  };

  const remove = (keyword: Keyword) =>
    run(async () => {
      try {
        await destroy.mutateAsync(keyword.id);
      } catch (failure) {
        // Already gone elsewhere: like a delete. Otherwise the keyword stays with its delete
        // button (#86).
        setWantFocus(
          (failure as RequestError).status === 404 ? 'keyword-day' : `keyword-delete-${keyword.id}`,
        );
        throw failure;
      } finally {
        // The confirm button goes away whether or not the delete worked.
        setDeletingId(undefined);
      }
      if (editor?.id === keyword.id) setEditor(undefined);
      setWantFocus('keyword-day');
      setNotice({ kind: 'status', text: 'Deleted' });
    }, keyword.id);

  const find = (event: { preventDefault(): void }) => {
    event.preventDefault();
    nameNext('search');
    if (!begin()) return;
    void runSearch(searchPath(search)).finally(end);
  };

  const changeForm = (field: keyof KeywordForm) => (event: { target: { value: string } }) => {
    setNotice(undefined);
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const changeEditor =
    (field: keyof KeywordForm | 'date') => (event: { target: { value: string } }) => {
      setNotice(undefined);
      setEditor(
        (current) =>
          current &&
          (field === 'date'
            ? { ...current, date: event.target.value }
            : { ...current, form: { ...current.form, [field]: event.target.value } }),
      );
    };

  const changeSearch = (field: keyof KeywordSearch) => (event: { target: { value: string } }) =>
    setSearch((current) => ({ ...current, [field]: event.target.value }));

  return (
    <div className="keywords">
      <section className="card" aria-label="Keyword entry">
        <h2>Today's keyword</h2>
        <KeywordFormView
          date={date}
          keyword={form.keyword}
          memo={form.memo}
          keywordId="keyword-input"
          placeholder="e.g. eigenvalue"
          memoLabel="Memo (optional)"
          submitLabel="Add"
          spinning={action === 'add'}
          busy={busy}
          onDate={(value) => pickDate({ target: { value } })}
          onKeyword={(value) => changeForm('keyword')({ target: { value } })}
          onMemo={(value) => changeForm('memo')({ target: { value } })}
          onSubmit={add}
        >
          {date !== today && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => pickDate({ target: { value: today } })}
            >
              Back to today
            </button>
          )}
        </KeywordFormView>
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

      <section className="card" aria-label={`Keywords for ${date}`}>
        <h2 id="keyword-day" tabIndex={-1}>
          Keywords for {date === today ? `today (${date})` : date}
        </h2>
        {error ? (
          <p role="alert" className="error">
            Could not load the keywords: {error}
          </p>
        ) : keywords === undefined ? (
          <Loading label="Loading the keywords" />
        ) : keywords.length === 0 ? (
          <p className="status">No keywords on this date</p>
        ) : (
          <ul className="log-list keyword-list">
            {keywords.map((keyword) =>
              editor?.id === keyword.id ? (
                <li key={keyword.id} className="editing">
                  <KeywordFormView
                    date={editor.date}
                    keyword={editor.form.keyword}
                    memo={editor.form.memo}
                    keywordId="keyword-edit-keyword"
                    memoLabel="Memo"
                    submitLabel="Save changes"
                    spinning={action === 'save'}
                    busy={busy}
                    onDate={(value) => changeEditor('date')({ target: { value } })}
                    onKeyword={(value) => changeEditor('keyword')({ target: { value } })}
                    onMemo={(value) => changeEditor('memo')({ target: { value } })}
                    onSubmit={save}
                  >
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => {
                        setEditor(undefined);
                        setWantFocus('keyword-day');
                      }}
                    >
                      Cancel
                    </button>
                  </KeywordFormView>
                </li>
              ) : (
                <li key={keyword.id}>
                  <div className="log-head">
                    <span className="log-date">{keyword.keyword}</span>
                  </div>
                  {keyword.memo && <p className="log-memo">{keyword.memo}</p>}
                  <div className="log-actions">
                    {deletingId === keyword.id ? (
                      <>
                        <button
                          type="button"
                          className="danger"
                          id={`keyword-delete-confirm-${keyword.id}`}
                          disabled={busy}
                          aria-label={`${keyword.keyword} confirm deletion`}
                          onClick={() => {
                            nameNext('delete');
                            void remove(keyword);
                          }}
                        >
                          <ButtonSpinner when={action === 'delete'} />
                          Confirm delete
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          aria-label={`${keyword.keyword} cancel deletion`}
                          onClick={() => {
                            setDeletingId(undefined);
                            setWantFocus(`keyword-delete-${keyword.id}`);
                          }}
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
                          aria-label={`${keyword.keyword} edit`}
                          onClick={() => {
                            setDeletingId(undefined);
                            setNotice(undefined);
                            // The Edit button is replaced by the form; focus goes to its first field.
                            setWantFocus('keyword-edit-keyword');
                            setEditor({
                              id: keyword.id,
                              date: keyword.date,
                              form: { keyword: keyword.keyword, memo: keyword.memo },
                            });
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          id={`keyword-delete-${keyword.id}`}
                          disabled={busy}
                          aria-label={`${keyword.keyword} delete`}
                          onClick={() => {
                            setDeletingId(keyword.id);
                            setWantFocus(`keyword-delete-confirm-${keyword.id}`);
                          }}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      <KeywordSearchCard
        search={search}
        results={results}
        error={searchError}
        busy={busy}
        action={action}
        onChange={changeSearch}
        onSubmit={find}
        onView={(value) => pickDate({ target: { value } })}
      />
    </div>
  );
}
