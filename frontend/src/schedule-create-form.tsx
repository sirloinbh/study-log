import { useState } from 'react';

import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { NativeSelect } from './components/ui/native-select';
import { apiKey, useApiQuery } from './lib/query';
import { ButtonSpinner } from './loading';
import { defaultEnd, defaultHours, hoursToMinutes } from './schedule';
import { contentLabel, type ContentNode, type Textbook } from './textbook';

export type Notice = { kind: 'status' | 'alert'; text: string } | undefined;

// What the form sends: the period, the daily minutes and the optional chapter range.
export type NewSchedule = {
  title: string;
  startDate: string;
  endDate: string;
  weekdayMinutes: number;
  restDayMinutes: number;
  chapters?: { textbookId: number; fromContentId: number | null; toContentId: number | null };
};

// The form that makes a schedule (#35) from a period and daily hours, with an optional textbook
// and chapter range. It keeps what is typed and reads the textbooks and the chapters of the picked
// one; the parent sends it (`onCreate` says whether it worked) and owns the message under it.
export function ScheduleCreateForm({
  today,
  busy,
  action,
  notice,
  setNotice,
  onCreate,
}: {
  today: string;
  busy: boolean;
  action: string | undefined;
  notice: Notice;
  setNotice: (notice: Notice) => void;
  onCreate: (schedule: NewSchedule) => Promise<boolean>;
}) {
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(defaultEnd(today));
  const [weekdayHours, setWeekdayHours] = useState(defaultHours.weekday);
  const [restDayHours, setRestDayHours] = useState(defaultHours.restDay);
  // A book is optional, and without a chapter picked its range runs to that end of the book.
  const [textbookId, setTextbookId] = useState('');
  const [fromContentId, setFromContentId] = useState('');
  const [toContentId, setToContentId] = useState('');
  const textbooksQuery = useApiQuery<{ textbooks: Textbook[] }>(
    apiKey('/api/textbooks'),
    '/api/textbooks',
  );
  const textbooks = textbooksQuery.data?.textbooks;
  const textbooksFailed = textbooksQuery.isError;
  // One cached list per book, so a slow answer for another one is never offered for this one.
  const chaptersQuery = useApiQuery<{ contents: ContentNode[] }>(
    apiKey('/api/textbooks', textbookId, 'contents'),
    `/api/textbooks/${textbookId}/contents`,
    // Always stale: choosing a book again reads its chapters again.
    { enabled: Boolean(textbookId), staleTime: 0 },
  );
  const chaptersFailed = chaptersQuery.isError;

  // Not while they are read again: what was read before does not count as read now.
  const bookChapters =
    textbookId && !chaptersQuery.isFetching && !chaptersQuery.isError
      ? chaptersQuery.data?.contents
      : undefined;

  const create = async (event: { preventDefault(): void }) => {
    event.preventDefault();
    const weekdayMinutes = hoursToMinutes(weekdayHours);
    const restDayMinutes = hoursToMinutes(restDayHours);
    if (weekdayMinutes === undefined || restDayMinutes === undefined) {
      setNotice({ kind: 'alert', text: 'Enter a daily amount between 0 and 24 hours' });
      return;
    }
    // Without its chapters read there was no chance to pick a range, and a whole book cannot be
    // narrowed afterwards (docs/decisions/schedule-rules.md section 6).
    if (textbookId && !bookChapters) {
      setNotice({
        kind: 'alert',
        text: 'The textbook contents have not been loaded yet. Try again in a moment or choose the textbook again',
      });
      return;
    }
    const made = await onCreate({
      title,
      startDate,
      endDate,
      weekdayMinutes,
      restDayMinutes,
      ...(textbookId && {
        chapters: {
          textbookId: Number(textbookId),
          fromContentId: fromContentId ? Number(fromContentId) : null,
          toContentId: toContentId ? Number(toContentId) : null,
        },
      }),
    });
    if (made) setTitle('');
  };

  // Typing takes back what was said about the last try.
  const typed = (set: (value: string) => void) => (event: { target: { value: string } }) => {
    setNotice(undefined);
    set(event.target.value);
  };

  const chapterOptions = bookChapters?.map((chapter) => (
    <option key={chapter.id} value={chapter.id}>
      {contentLabel(chapter)}
    </option>
  ));

  return (
    <section className="card" aria-label="Create a schedule">
      <h2>Create a schedule</h2>
      <form className="log-form" onSubmit={(event) => void create(event)}>
        <label className="wide">
          Schedule name
          <Input
            required
            maxLength={200}
            placeholder="e.g. Algorithms textbook, first pass"
            disabled={busy}
            value={title}
            onChange={typed(setTitle)}
          />
        </label>
        <label>
          Start date
          <Input
            type="date"
            required
            min={today}
            disabled={busy}
            value={startDate}
            onChange={typed(setStartDate)}
          />
        </label>
        <label>
          End date
          <Input
            type="date"
            required
            min={startDate}
            disabled={busy}
            value={endDate}
            onChange={typed(setEndDate)}
          />
        </label>
        <label>
          Weekdays (hours)
          <Input
            type="number"
            required
            min={0}
            max={24}
            step={0.5}
            disabled={busy}
            value={weekdayHours}
            onChange={typed(setWeekdayHours)}
          />
        </label>
        <label>
          Weekends and holidays (hours)
          <Input
            type="number"
            required
            min={0}
            max={24}
            step={0.5}
            disabled={busy}
            value={restDayHours}
            onChange={typed(setRestDayHours)}
          />
        </label>
        <label className="half">
          Textbook (optional)
          <NativeSelect
            disabled={busy || !textbooks}
            value={textbookId}
            onChange={(event) => {
              setNotice(undefined);
              setTextbookId(event.target.value);
              setFromContentId('');
              setToContentId('');
            }}
          >
            <option value="">Time only, no textbook</option>
            {textbooks?.map((book) => (
              <option key={book.id} value={book.id}>
                {book.title}
              </option>
            ))}
          </NativeSelect>
        </label>
        {textbookId && (
          <>
            <label>
              First chapter
              <NativeSelect
                disabled={busy || !bookChapters?.length}
                value={fromContentId}
                onChange={typed(setFromContentId)}
              >
                <option value="">From the start</option>
                {chapterOptions}
              </NativeSelect>
            </label>
            <label>
              Last chapter
              <NativeSelect
                disabled={busy || !bookChapters?.length}
                value={toContentId}
                onChange={typed(setToContentId)}
              >
                <option value="">To the end</option>
                {chapterOptions}
              </NativeSelect>
            </label>
          </>
        )}
        {textbooksFailed && <p className="status wide">Could not load the textbooks</p>}
        {textbookId && chaptersFailed && (
          <p className="status wide">Could not load the contents of this textbook</p>
        )}
        {bookChapters?.length === 0 && (
          <p className="status wide">This textbook has no chapters. Add its contents first</p>
        )}
        <div className="actions wide">
          <Button type="submit" disabled={busy}>
            <ButtonSpinner when={action === 'create'} />
            Create a schedule
          </Button>
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
  );
}
