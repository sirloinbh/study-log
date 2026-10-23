import React, { useEffect, useState } from 'react';
import { requestJson, type RequestError } from './api';
import {
  emptyKeywordForm,
  keywordLimits,
  searchPath,
  type Keyword,
  type KeywordForm,
  type KeywordSearch,
} from './keyword';

type Notice = { kind: 'status' | 'alert'; text: string } | undefined;

// An open edit of one keyword; its date can be changed too.
type Editor = { id: number; date: string; form: KeywordForm };

// Keywords of the day (#40): quick entry for a picked date (today by default), that date's list
// with edit and delete, and a search over all dates.
export function Keywords({ today }: { today: string }) {
  const [date, setDate] = useState(today);
  const [form, setForm] = useState<KeywordForm>(emptyKeywordForm);
  // Tagged with its date, so a slow answer for another day is never shown as this day's.
  const [day, setDay] = useState<{ date: string; keywords: Keyword[] }>();
  const [dayError, setDayError] = useState<{ date: string; message: string }>();
  const [editor, setEditor] = useState<Editor>();
  const [deletingId, setDeletingId] = useState<number>();
  const [notice, setNotice] = useState<Notice>(undefined);
  // One change at a time, including the reloads after it.
  const [busy, setBusy] = useState(false);
  // The element to focus once the change is done and the controls are enabled again.
  const [wantFocus, setWantFocus] = useState<string>();
  const [search, setSearch] = useState<KeywordSearch>({ q: '', from: '', to: '' });
  // The last search run and its results; kept until the next search so changes can refresh it.
  const [results, setResults] = useState<{ path: string; keywords: Keyword[] }>();
  const [searchError, setSearchError] = useState<string>();

  useEffect(() => {
    if (!date) return;
    let current = true;
    requestJson<{ keywords: Keyword[] }>(`/api/keywords?date=${date}`)
      .then((data) => {
        if (!current) return;
        setDay({ date, keywords: data.keywords });
        setDayError(undefined);
      })
      .catch((error: RequestError) => {
        if (current) setDayError({ date, message: error.message });
      });
    return () => {
      current = false;
    };
  }, [date]);

  // After an add the keyword field takes focus again; after an edit or delete, whose buttons are
  // gone, the day's heading does, so keyboard users keep their place.
  useEffect(() => {
    if (!wantFocus || busy) return;
    setWantFocus(undefined);
    document.getElementById(wantFocus)?.focus?.();
  }, [wantFocus, busy]);

  const keywords = day?.date === date ? day.keywords : undefined;
  const error = dayError?.date === date ? dayError.message : undefined;

  const reloadDay = async () => {
    try {
      const data = await requestJson<{ keywords: Keyword[] }>(`/api/keywords?date=${date}`);
      setDay({ date, keywords: data.keywords });
      setDayError(undefined);
    } catch (failure) {
      setDayError({ date, message: (failure as RequestError).message });
    }
  };

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

  // Runs one change, then reloads the day and the shown search results, all while busy. A 404
  // closes the editor when it is about the keyword being edited.
  const run = async (change: () => Promise<void>, targetId?: number) => {
    if (busy) return;
    setBusy(true);
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
      await reloadDay();
      if (results) await runSearch(results.path);
      setBusy(false);
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
    void run(async () => {
      await requestJson('/api/keywords', { method: 'POST', body: { date, ...form } });
      setForm(emptyKeywordForm());
      setNotice({ kind: 'status', text: '추가했습니다' });
      setWantFocus('keyword-input');
    });
  };

  const save = (event: { preventDefault(): void }) => {
    event.preventDefault();
    if (!editor) return;
    void run(async () => {
      await requestJson(`/api/keywords/${editor.id}`, {
        method: 'PUT',
        body: { date: editor.date, ...editor.form },
      });
      setEditor(undefined);
      setWantFocus('keyword-day');
      setNotice({
        kind: 'status',
        text: editor.date === date ? '수정했습니다' : `수정해서 ${editor.date}로 옮겼습니다`,
      });
    }, editor.id);
  };

  const remove = (keyword: Keyword) =>
    run(async () => {
      try {
        await requestJson(`/api/keywords/${keyword.id}`, { method: 'DELETE' });
      } finally {
        // The confirm button goes away whether or not the delete worked.
        setDeletingId(undefined);
        setWantFocus('keyword-day');
      }
      if (editor?.id === keyword.id) setEditor(undefined);
      setWantFocus('keyword-day');
      setNotice({ kind: 'status', text: '삭제했습니다' });
    }, keyword.id);

  const find = (event: { preventDefault(): void }) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    void runSearch(searchPath(search)).finally(() => setBusy(false));
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
      <section className="card" aria-label="키워드 입력">
        <h2>오늘의 키워드</h2>
        <form className="log-form keyword-form" onSubmit={add}>
          <label>
            날짜
            <input type="date" required disabled={busy} value={date} onChange={pickDate} />
          </label>
          <label className="keyword-field">
            키워드
            <input
              id="keyword-input"
              required
              maxLength={keywordLimits.keyword}
              placeholder="예: 고유값"
              disabled={busy}
              value={form.keyword}
              onChange={changeForm('keyword')}
            />
          </label>
          <label className="wide">
            메모 (선택)
            <input
              maxLength={keywordLimits.memo}
              disabled={busy}
              value={form.memo}
              onChange={changeForm('memo')}
            />
          </label>
          <div className="actions wide">
            <button type="submit" className="primary" disabled={busy}>
              추가
            </button>
            {date !== today && (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => pickDate({ target: { value: today } })}
              >
                오늘로
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

      <section className="card" aria-label={`${date} 키워드`}>
        <h2 id="keyword-day" tabIndex={-1}>
          {date === today ? `오늘 (${date})` : date}의 키워드
        </h2>
        {error ? (
          <p role="alert" className="error">
            키워드를 불러오지 못했습니다: {error}
          </p>
        ) : keywords === undefined ? (
          <p className="status">불러오는 중…</p>
        ) : keywords.length === 0 ? (
          <p className="status">이 날짜에 남긴 키워드가 없습니다</p>
        ) : (
          <ul className="log-list keyword-list">
            {keywords.map((keyword) =>
              editor?.id === keyword.id ? (
                <li key={keyword.id} className="editing">
                  <form className="log-form keyword-form" onSubmit={save}>
                    <label>
                      날짜
                      <input
                        type="date"
                        required
                        disabled={busy}
                        value={editor.date}
                        onChange={changeEditor('date')}
                      />
                    </label>
                    <label className="keyword-field">
                      키워드
                      <input
                        required
                        maxLength={keywordLimits.keyword}
                        disabled={busy}
                        value={editor.form.keyword}
                        onChange={changeEditor('keyword')}
                      />
                    </label>
                    <label className="wide">
                      메모
                      <input
                        maxLength={keywordLimits.memo}
                        disabled={busy}
                        value={editor.form.memo}
                        onChange={changeEditor('memo')}
                      />
                    </label>
                    <div className="actions wide">
                      <button type="submit" className="primary" disabled={busy}>
                        수정 저장
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        onClick={() => {
                          setEditor(undefined);
                          setWantFocus('keyword-day');
                        }}
                      >
                        취소
                      </button>
                    </div>
                  </form>
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
                          disabled={busy}
                          aria-label={`${keyword.keyword} 삭제 확인`}
                          onClick={() => remove(keyword)}
                        >
                          삭제 확인
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          aria-label={`${keyword.keyword} 삭제 취소`}
                          onClick={() => setDeletingId(undefined)}
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
                          aria-label={`${keyword.keyword} 수정`}
                          onClick={() => {
                            setDeletingId(undefined);
                            setNotice(undefined);
                            setEditor({
                              id: keyword.id,
                              date: keyword.date,
                              form: { keyword: keyword.keyword, memo: keyword.memo },
                            });
                          }}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          aria-label={`${keyword.keyword} 삭제`}
                          onClick={() => setDeletingId(keyword.id)}
                        >
                          삭제
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

      <section className="card" aria-label="키워드 검색">
        <h2>키워드 검색</h2>
        <form className="log-form keyword-search" onSubmit={find}>
          <label className="wide">
            검색어
            <input
              type="search"
              maxLength={keywordLimits.query}
              placeholder="키워드나 메모의 일부"
              disabled={busy}
              value={search.q}
              onChange={changeSearch('q')}
            />
          </label>
          <label className="half">
            시작일
            {/* The browser refuses a start after the end before asking the server. */}
            <input
              type="date"
              disabled={busy}
              max={search.to || undefined}
              value={search.from}
              onChange={changeSearch('from')}
            />
          </label>
          <label className="half">
            종료일
            <input
              type="date"
              disabled={busy}
              min={search.from || undefined}
              value={search.to}
              onChange={changeSearch('to')}
            />
          </label>
          <div className="actions wide">
            <button type="submit" className="primary" disabled={busy}>
              검색
            </button>
          </div>
        </form>
        {searchError && (
          <p role="alert" className="error">
            검색하지 못했습니다: {searchError}
          </p>
        )}
        {results &&
          !searchError &&
          (results.keywords.length === 0 ? (
            <p className="status">검색 결과가 없습니다</p>
          ) : (
            <>
              <p className="status">{results.keywords.length}개를 찾았습니다</p>
              <ul className="log-list keyword-results">
                {results.keywords.map((keyword) => (
                  <li key={keyword.id}>
                    <div className="log-head">
                      <span className="log-date">{keyword.keyword}</span>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        aria-label={`${keyword.keyword} ${keyword.date} 보기`}
                        onClick={() => pickDate({ target: { value: keyword.date } })}
                      >
                        {keyword.date}
                      </button>
                    </div>
                    {keyword.memo && <p className="log-memo">{keyword.memo}</p>}
                  </li>
                ))}
              </ul>
            </>
          ))}
      </section>
    </div>
  );
}
