import React, { useEffect, useRef, useState } from 'react';

import { useBusy } from './busy';
import { ContentsEntryForm } from './contents-entry-form';
import { ContentsPasteForm } from './contents-paste-form';
import { ContentsTree } from './contents-tree';
import { type RequestError, requestJson } from './lib/api';
import { Loading } from './loading';
import { readPdfToc } from './pdf-import';
import { pdfSizeLimit } from './pdf-toc';
import { contentLabel, type ContentNode } from './textbook';
import { parseToc, tocLimits, tocProblems } from './toc';

type Notice = { kind: 'status' | 'alert'; text: string; textbookId: number } | undefined;

// The open editor: a new entry under `parentId` (null for a chapter) or an edit of `id`.
type Editor = {
  textbookId: number;
  parentId: number | null;
  id?: number;
  heading: string;
  number: string;
  title: string;
};

// State is tagged with its textbook, so switching textbooks never shows or edits the previous
// textbook's contents, even before the new ones arrive. `onTree` hears each tree shown (undefined
// while loading, with `failed` when the first load failed), so the exercises card picks from the
// same contents. It may change on every render: it is called through a ref, only when the tree,
// the error or the textbook changes.
// `reloadKey` changes when another card learned the tree is out of date (#74).
export function TextbookContents({
  textbookId,
  onTree,
  reloadKey,
}: {
  textbookId: number;
  onTree?: (shown: { textbookId: number; tree?: ContentNode[]; failed: boolean }) => void;
  reloadKey?: number;
}) {
  const [loaded, setLoaded] = useState<{ textbookId: number; tree: ContentNode[] }>();
  const [loadError, setLoadError] = useState<{ textbookId: number; message: string }>();
  const [editor, setEditor] = useState<Editor>();
  const [deleting, setDeleting] = useState<{ textbookId: number; id: number }>();
  // The pasted table of contents being previewed (#23).
  const [paste, setPaste] = useState<{ textbookId: number; text: string }>();
  // A PDF being read into the paste box, numbered. Closing the box or opening an editor moves
  // `readSeq` on, so a read that finishes afterwards is dropped instead of reopening the box.
  const readSeq = useRef(0);
  const [readingPdf, setReadingPdf] = useState<{ textbookId: number; seq: number }>();
  const dropRead = () => {
    readSeq.current++;
    setReadingPdf(undefined);
  };
  const [notice, setNotice] = useState<Notice>(undefined);
  // One request at a time: fields and buttons stay disabled while a change and the reload after
  // it are pending, so the next change never starts from an outdated tree.
  const { busy, action, nameNext, begin, end } = useBusy();
  // Along the delete flow: the confirm button, the delete button after a cancel, or the card
  // heading once the entry is gone. Focused once the controls are enabled again (#86).
  const [wantFocus, setWantFocus] = useState<string>();
  useEffect(() => {
    if (!wantFocus || busy) return;
    setWantFocus(undefined);
    document.getElementById(wantFocus)?.focus?.();
  }, [wantFocus, busy]);

  // The first load, and a reload asked for by another card. Reloads after a change made here
  // happen inside that change (see `run`). The tree on screen stays until the new one arrives.
  useEffect(() => {
    let current = true;
    requestJson<{ contents: ContentNode[] }>(`/api/textbooks/${textbookId}/contents`)
      .then((data) => {
        if (!current) return;
        setLoaded({ textbookId, tree: data.contents });
        setLoadError(undefined);
      })
      .catch((error: RequestError) => {
        if (current) setLoadError({ textbookId, message: error.message });
      });
    return () => {
      current = false;
    };
  }, [textbookId, reloadKey]);

  const tree = loaded?.textbookId === textbookId ? loaded.tree : undefined;
  const error = loadError?.textbookId === textbookId ? loadError.message : undefined;
  const open = editor?.textbookId === textbookId ? editor : undefined;
  const deletingId = deleting?.textbookId === textbookId ? deleting.id : undefined;
  const shown = notice?.textbookId === textbookId ? notice : undefined;
  const pasting = paste?.textbookId === textbookId ? paste : undefined;
  const reading = readingPdf?.textbookId === textbookId;
  const pasted = pasting ? parseToc(pasting.text) : [];
  const pasteProblems = tocProblems(pasted);

  // Read through a ref, so a new function on each render of the parent cannot rerun the effect.
  const onTreeRef = useRef(onTree);
  useEffect(() => {
    onTreeRef.current = onTree;
  });
  useEffect(() => {
    onTreeRef.current?.({ textbookId, tree, failed: tree === undefined && error !== undefined });
  }, [textbookId, tree, error]);

  const say = (kind: 'status' | 'alert', text: string) => setNotice({ kind, text, textbookId });

  // Loads the server's tree; a failure is shown next to the tree already on screen.
  const refresh = async () => {
    try {
      const data = await requestJson<{ contents: ContentNode[] }>(
        `/api/textbooks/${textbookId}/contents`,
      );
      setLoaded({ textbookId, tree: data.contents });
      setLoadError(undefined);
    } catch (failure) {
      setLoadError({ textbookId, message: (failure as RequestError).message });
    }
  };

  // Runs one change and then reloads the tree, both while busy. On failure shows the server's
  // message. A 404 closes the editor only when it is about the entry being edited (`targetId`)
  // or the textbook.
  const run = async (change: () => Promise<boolean | void>, targetId?: number) => {
    if (!begin()) return;
    try {
      // A change that already returned the new tree (reorder) answers true.
      if (!(await change())) await refresh();
    } catch (failure) {
      const { message, status } = failure as RequestError;
      say('alert', message);
      if (status === 404 && (targetId === undefined || targetId === open?.id)) setEditor(undefined);
      await refresh();
    } finally {
      end();
    }
  };

  const startAdd = (parent?: ContentNode) => {
    dropRead();
    setPaste(undefined);
    setDeleting(undefined);
    setNotice(undefined);
    setEditor({
      textbookId,
      parentId: parent?.id ?? null,
      heading: parent ? `Add under '${contentLabel(parent)}'` : 'Add chapter',
      number: '',
      title: '',
    });
  };

  const startEdit = (node: ContentNode) => {
    dropRead();
    setPaste(undefined);
    setDeleting(undefined);
    setNotice(undefined);
    setEditor({
      textbookId,
      parentId: null,
      id: node.id,
      heading: 'Edit contents entry',
      number: node.number,
      title: node.title,
    });
  };

  const save = (event: { preventDefault(): void }) => {
    event.preventDefault();
    if (!open) return;
    nameNext('save');
    void run(async () => {
      const body = { number: open.number, title: open.title };
      if (open.id === undefined)
        await requestJson(`/api/textbooks/${textbookId}/contents`, {
          method: 'POST',
          body: { ...body, parentId: open.parentId },
        });
      else
        await requestJson(`/api/textbooks/${textbookId}/contents/${open.id}`, {
          method: 'PUT',
          body,
        });
      say('status', open.id === undefined ? 'Added' : 'Updated');
      setEditor(undefined);
    }, open.id);
  };

  const startPaste = () => {
    dropRead();
    setEditor(undefined);
    setDeleting(undefined);
    setNotice(undefined);
    setPaste({ textbookId, text: '' });
  };

  // Puts the table of contents read from a PDF into the paste box, to check and fix like pasted
  // text. Replaces what is in the box.
  const importPdf = async (file: { size: number; arrayBuffer(): Promise<ArrayBuffer> }) => {
    const id = textbookId;
    const tell = (kind: 'status' | 'alert', text: string) =>
      setNotice({ kind, text, textbookId: id });
    if (file.size > pdfSizeLimit) return tell('alert', 'Only PDFs of 50 MB or less can be read');
    const seq = ++readSeq.current;
    setReadingPdf({ textbookId: id, seq });
    tell('status', 'Reading the PDF…');
    try {
      const toc = await readPdfToc(file);
      if (readSeq.current !== seq) return;
      const text = toc.lines.join('\n').slice(0, tocLimits.text);
      if (!text.trim())
        return tell('alert', 'No text was found in the PDF. Text in scanned PDFs cannot be read');
      setPaste({ textbookId: id, text });
      tell(
        'status',
        toc.source === 'outline'
          ? `Imported ${toc.lines.length} contents lines from the PDF bookmarks`
          : `No bookmarks, so the text of the first ${toc.pages} pages was imported. Delete the lines that are not contents`,
      );
    } catch (failure) {
      if (readSeq.current === seq)
        tell('alert', `Could not read the PDF: ${(failure as Error).message}`);
    } finally {
      setReadingPdf((current) => (current?.seq === seq ? undefined : current));
    }
  };

  // Saves every previewed entry at once, after the chapters already there.
  const savePaste = (event: { preventDefault(): void }) => {
    event.preventDefault();
    if (!pasted.length || pasteProblems.length) return;
    nameNext('paste');
    void run(async () => {
      const data = await requestJson<{ contents: ContentNode[] }>(
        `/api/textbooks/${textbookId}/contents/bulk`,
        {
          method: 'POST',
          body: { entries: pasted.map(({ level, number, title }) => ({ level, number, title })) },
        },
      );
      setLoaded({ textbookId, tree: data.contents });
      say('status', `Added ${pasted.length} contents entries`);
      setPaste(undefined);
      return true;
    });
  };

  const remove = (node: ContentNode) =>
    run(async () => {
      try {
        await requestJson(`/api/textbooks/${textbookId}/contents/${node.id}`, {
          method: 'DELETE',
        });
      } catch (failure) {
        // Already gone elsewhere: like a delete. Otherwise (e.g. study logs still point at it)
        // the entry stays with its delete button.
        setWantFocus(
          (failure as RequestError).status === 404
            ? 'contents-heading'
            : `content-delete-${node.id}`,
        );
        throw failure;
      } finally {
        setDeleting(undefined);
      }
      setWantFocus('contents-heading');
      say('status', 'Deleted');
      if (open?.id === node.id) setEditor(undefined);
    }, node.id);

  // Swaps the entry with its neighbour and saves the siblings' new order.
  const move = (siblings: ContentNode[], index: number, step: -1 | 1, parentId: number | null) =>
    run(async () => {
      const ids = siblings.map((node) => node.id);
      [ids[index], ids[index + step]] = [ids[index + step], ids[index]];
      const data = await requestJson<{ contents: ContentNode[] }>(
        `/api/textbooks/${textbookId}/contents/order`,
        { method: 'PUT', body: { parentId, ids } },
      );
      setLoaded({ textbookId, tree: data.contents });
      setNotice(undefined);
      return true;
    });

  const change = (field: 'number' | 'title') => (event: { target: { value: string } }) => {
    setNotice(undefined);
    setEditor((current) => current && { ...current, [field]: event.target.value });
  };

  return (
    <div className="contents">
      <div className="contents-head">
        <h3 id="contents-heading" tabIndex={-1}>
          Contents
        </h3>
        <div className="log-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy || tree === undefined}
            onClick={startPaste}
          >
            Paste contents
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy || tree === undefined}
            onClick={() => startAdd()}
          >
            Add chapter
          </button>
        </div>
      </div>
      {pasting && (
        <ContentsPasteForm
          text={pasting.text}
          entries={pasted}
          problems={pasteProblems}
          hasContents={!!tree?.length}
          busy={busy}
          reading={reading}
          action={action}
          onText={(text) => setPaste({ textbookId, text })}
          onPdf={(file) => void importPdf(file)}
          onSubmit={savePaste}
          onCancel={() => {
            dropRead();
            setNotice(undefined);
            setPaste(undefined);
          }}
        />
      )}
      {open && (
        // Keyed by its target so the title field takes focus again for each new add or edit.
        <ContentsEntryForm
          key={open.id ?? `under-${open.parentId}`}
          heading={open.heading}
          number={open.number}
          title={open.title}
          isNew={open.id === undefined}
          busy={busy}
          action={action}
          onSubmit={save}
          onChange={change}
          onCancel={() => setEditor(undefined)}
        />
      )}
      {/* Always mounted so screen readers announce each new message. */}
      <p role="status" className="status">
        {shown?.kind === 'status' ? shown.text : ''}
      </p>
      {shown?.kind === 'alert' && (
        <p role="alert" className="error">
          {shown.text}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          Could not load the contents: {error}
        </p>
      )}
      {tree === undefined ? (
        !error && <Loading label="Loading the contents" />
      ) : tree.length === 0 ? (
        <p className="status">No contents yet</p>
      ) : (
        <ContentsTree
          nodes={tree}
          parentId={null}
          openId={open?.id}
          deletingId={deletingId}
          busy={busy}
          action={action}
          onMove={(siblings, index, step, parentId) => void move(siblings, index, step, parentId)}
          onAddChild={startAdd}
          onEdit={startEdit}
          onAskDelete={(node) => {
            setDeleting({ textbookId, id: node.id });
            setWantFocus(`content-delete-confirm-${node.id}`);
          }}
          onConfirmDelete={(node) => {
            nameNext('delete');
            void remove(node);
          }}
          onCancelDelete={(node) => {
            setDeleting(undefined);
            setWantFocus(`content-delete-${node.id}`);
          }}
        />
      )}
    </div>
  );
}
