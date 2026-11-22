import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { type Keyword, keywordLimits, type KeywordSearch } from './keyword';
import { ButtonSpinner } from './loading';

// The search over all dates: a term and a date range, and the matches, each with a button that
// opens its day. The parent runs the search.
export function KeywordSearchCard({
  search,
  results,
  error,
  busy,
  action,
  onChange,
  onSubmit,
  onView,
}: {
  search: KeywordSearch;
  results: { keywords: Keyword[] } | undefined;
  error: string | undefined;
  busy: boolean;
  action: string | undefined;
  onChange: (field: keyof KeywordSearch) => (event: { target: { value: string } }) => void;
  onSubmit: (event: { preventDefault(): void }) => void;
  onView: (date: string) => void;
}) {
  return (
    <section className="card" aria-label="Keyword search">
      <h2>Keyword search</h2>
      <form className="log-form keyword-search" onSubmit={onSubmit}>
        <label className="wide">
          Search term
          <Input
            type="search"
            maxLength={keywordLimits.query}
            placeholder="Part of a keyword or memo"
            disabled={busy}
            value={search.q}
            onChange={onChange('q')}
          />
        </label>
        <label className="half">
          Start date
          {/* The browser refuses a start after the end before asking the server. */}
          <Input
            type="date"
            disabled={busy}
            max={search.to || undefined}
            value={search.from}
            onChange={onChange('from')}
          />
        </label>
        <label className="half">
          End date
          <Input
            type="date"
            disabled={busy}
            min={search.from || undefined}
            value={search.to}
            onChange={onChange('to')}
          />
        </label>
        <div className="actions wide">
          <Button type="submit" disabled={busy}>
            <ButtonSpinner when={action === 'search'} />
            Search
          </Button>
        </div>
      </form>
      {error && (
        <p role="alert" className="error">
          Could not search: {error}
        </p>
      )}
      {results &&
        !error &&
        (results.keywords.length === 0 ? (
          <p className="status">No results</p>
        ) : (
          <>
            <p className="status">Found {results.keywords.length}</p>
            <ul className="log-list keyword-results">
              {results.keywords.map((keyword) => (
                <li key={keyword.id}>
                  <div className="log-head">
                    <span className="log-date">{keyword.keyword}</span>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      aria-label={`View ${keyword.keyword} on ${keyword.date}`}
                      onClick={() => onView(keyword.date)}
                    >
                      {keyword.date}
                    </Button>
                  </div>
                  {keyword.memo && <p className="log-memo">{keyword.memo}</p>}
                </li>
              ))}
            </ul>
          </>
        ))}
    </section>
  );
}
