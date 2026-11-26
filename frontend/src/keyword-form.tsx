import type { ReactNode } from 'react';

import { Button } from './components/ui/button';
import { Combobox } from './components/ui/combobox';
import { Input } from './components/ui/input';
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
  suggestions,
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
  // Keywords already used, offered as suggestions; a new one can still be typed.
  suggestions: readonly string[];
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
        <Input
          type="date"
          required
          disabled={busy}
          value={date}
          onChange={(event) => onDate(event.target.value)}
        />
      </label>
      <div className="keyword-field combo-field">
        <label htmlFor={keywordId}>Keyword</label>
        <Combobox
          id={keywordId}
          required
          maxLength={keywordLimits.keyword}
          placeholder={placeholder}
          disabled={busy}
          value={keyword}
          onValueChange={onKeyword}
          options={suggestions}
          listLabel="Keywords already used"
        />
      </div>
      <label className="wide">
        {memoLabel}
        <Input
          maxLength={keywordLimits.memo}
          disabled={busy}
          value={memo}
          onChange={(event) => onMemo(event.target.value)}
        />
      </label>
      <div className="actions wide">
        <Button type="submit" disabled={busy}>
          <ButtonSpinner when={spinning} />
          {submitLabel}
        </Button>
        {children}
      </div>
    </form>
  );
}
