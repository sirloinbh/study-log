import type { ReactNode } from 'react';

import { keywordLimits } from './keyword';
import { ButtonSpinner } from './loading';

// The form for one keyword, used both to add a keyword and to edit one: a date, the keyword and a
// memo, a submit button, and whatever other buttons the caller puts after it (`children`).
export function KeywordFormView({
  date,
  keyword,
  memo,
  keywordId,
  placeholder,
  memoLabel,
  submitLabel,
  spinning,
  busy,
  onDate,
  onKeyword,
  onMemo,
  onSubmit,
  children,
}: {
  date: string;
  keyword: string;
  memo: string;
  keywordId: string;
  placeholder?: string;
  memoLabel: string;
  submitLabel: string;
  spinning: boolean;
  busy: boolean;
  onDate: (value: string) => void;
  onKeyword: (value: string) => void;
  onMemo: (value: string) => void;
  onSubmit: (event: { preventDefault(): void }) => void;
  children?: ReactNode;
}) {
  return (
    <form className="log-form keyword-form" onSubmit={onSubmit}>
      <label>
        Date
        <input
          type="date"
          required
          disabled={busy}
          value={date}
          onChange={(event) => onDate(event.target.value)}
        />
      </label>
      <label className="keyword-field">
        Keyword
        <input
          id={keywordId}
          required
          maxLength={keywordLimits.keyword}
          placeholder={placeholder}
          disabled={busy}
          value={keyword}
          onChange={(event) => onKeyword(event.target.value)}
        />
      </label>
      <label className="wide">
        {memoLabel}
        <input
          maxLength={keywordLimits.memo}
          disabled={busy}
          value={memo}
          onChange={(event) => onMemo(event.target.value)}
        />
      </label>
      <div className="actions wide">
        <button type="submit" className="primary" disabled={busy}>
          <ButtonSpinner when={spinning} />
          {submitLabel}
        </button>
        {children}
      </div>
    </form>
  );
}
