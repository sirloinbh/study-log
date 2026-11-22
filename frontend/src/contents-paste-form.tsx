import { Button } from './components/ui/button';
import { ButtonSpinner } from './loading';
import { contentLabel } from './textbook';
import { type TocEntry, tocLimits, type TocTree, tocTree } from './toc';

const renderPreview = (nodes: TocTree[]) => (
  <ul className="content-tree">
    {nodes.map((node) => (
      <li key={node.line}>
        <div className="content-row">
          <span className="content-label">{contentLabel(node)}</span>
        </div>
        {node.children.length > 0 && renderPreview(node.children)}
      </li>
    ))}
  </ul>
);

// The box where a table of contents is pasted or imported from a PDF (#23), with the preview of
// the entries read from it and what is wrong with them. The parent parses the text and saves.
export function ContentsPasteForm({
  text,
  entries,
  problems,
  hasContents,
  busy,
  reading,
  action,
  onText,
  onPdf,
  onSubmit,
  onCancel,
}: {
  text: string;
  entries: TocEntry[];
  problems: string[];
  hasContents: boolean;
  busy: boolean;
  reading: boolean;
  action: string | undefined;
  onText: (text: string) => void;
  onPdf: (file: File) => void;
  onSubmit: (event: { preventDefault(): void }) => void;
  onCancel: () => void;
}) {
  return (
    <form className="log-form content-form toc-paste" onSubmit={onSubmit}>
      <label className="wide">
        Contents text
        <textarea
          // eslint-disable-next-line jsx-a11y-x/no-autofocus -- this field opens on a click, so focus follows that action.
          autoFocus
          rows={8}
          maxLength={tocLimits.text}
          disabled={busy || reading}
          value={text}
          aria-describedby="toc-paste-hint"
          onChange={(event) => onText(event.target.value)}
        />
      </label>
      <label className="wide">
        Import from PDF
        <input
          type="file"
          accept="application/pdf,.pdf"
          disabled={busy || reading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Cleared so picking the same file again reads it again.
            event.target.value = '';
            if (file) onPdf(file);
          }}
        />
      </label>
      <p id="toc-paste-hint" className="hint wide">
        Paste one entry per line or import from a PDF (its bookmarks if it has them, otherwise the
        text of the first 20 pages). Levels are split by numbers such as 1, 1.1, Chapter 1, or 제1장
        (Korean chapter); lines without a number follow their indentation. Page numbers are dropped.
        If the preview is wrong, fix the text.
      </p>
      {entries.length > 0 && (
        <section className="toc-preview wide" aria-label="Contents preview">
          <h4>
            Preview · {entries.length}
            {hasContents ? ' (added after the existing contents)' : ''}
          </h4>
          {renderPreview(tocTree(entries))}
        </section>
      )}
      {problems.length > 0 && (
        <ul className="error wide" role="alert">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      <div className="actions wide">
        <Button
          type="submit"

          disabled={busy || reading || !entries.length || problems.length > 0}
        >
          <ButtonSpinner when={action === 'paste'} />
          {entries.length ? `Save ${entries.length}` : 'Save'}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
