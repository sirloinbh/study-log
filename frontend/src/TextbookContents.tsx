import React, { useEffect, useState } from 'react';
import { useBusy } from './busy';
import { requestJson, type RequestError } from './api';
import { contentLabel, type ContentNode } from './textbook';

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
// same contents. It must be a stable function such as a state setter: a new function on every
// render would rerun the effect below and, with a state update in it, render forever.
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
  const [notice, setNotice] = useState<Notice>(undefined);
  // One request at a time: fields and buttons stay disabled while a change and the reload after
  // it are pending, so the next change never starts from an outdated tree.
  const { busy, begin, end } = useBusy();

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

  useEffect(() => {
    onTree?.({ textbookId, tree, failed: tree === undefined && error !== undefined });
  }, [onTree, textbookId, tree, error]);

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
    setDeleting(undefined);
    setNotice(undefined);
    setEditor({
      textbookId,
      parentId: parent?.id ?? null,
      heading: parent ? `'${contentLabel(parent)}' 아래에 추가` : '장 추가',
      number: '',
      title: '',
    });
  };

  const startEdit = (node: ContentNode) => {
    setDeleting(undefined);
    setNotice(undefined);
    setEditor({
      textbookId,
      parentId: null,
      id: node.id,
      heading: '목차 수정',
      number: node.number,
      title: node.title,
    });
  };

  const save = (event: { preventDefault(): void }) => {
    event.preventDefault();
    if (!open) return;
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
      say('status', open.id === undefined ? '추가했습니다' : '수정했습니다');
      setEditor(undefined);
    }, open.id);
  };

  const remove = (node: ContentNode) =>
    run(async () => {
      try {
        await requestJson(`/api/textbooks/${textbookId}/contents/${node.id}`, {
          method: 'DELETE',
        });
      } finally {
        setDeleting(undefined);
      }
      say('status', '삭제했습니다');
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

  const renderNodes = (nodes: ContentNode[], parentId: number | null) => (
    <ul className="content-tree">
      {nodes.map((node, index) => {
        const label = contentLabel(node);
        return (
          <li key={node.id}>
            <div className={`content-row${open?.id === node.id ? ' editing' : ''}`}>
              <span className="content-label">{label}</span>
              <div className="log-actions">
                {deletingId === node.id ? (
                  <>
                    <button
                      type="button"
                      className="danger"
                      disabled={busy}
                      aria-label={`${label} 목차 삭제 확인`}
                      onClick={() => remove(node)}
                    >
                      삭제 확인
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      aria-label={`${label} 목차 삭제 취소`}
                      onClick={() => setDeleting(undefined)}
                    >
                      취소
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy || index === 0}
                      aria-label={`${label} 위로 이동`}
                      onClick={() => move(nodes, index, -1, parentId)}
                    >
                      위로
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy || index === nodes.length - 1}
                      aria-label={`${label} 아래로 이동`}
                      onClick={() => move(nodes, index, 1, parentId)}
                    >
                      아래로
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      aria-label={`${label} 하위 추가`}
                      onClick={() => startAdd(node)}
                    >
                      하위 추가
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      aria-label={`${label} 목차 수정`}
                      onClick={() => startEdit(node)}
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      aria-label={`${label} 목차 삭제`}
                      onClick={() => setDeleting({ textbookId, id: node.id })}
                    >
                      삭제
                    </button>
                  </>
                )}
              </div>
            </div>
            {node.children.length > 0 && renderNodes(node.children, node.id)}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="contents">
      <div className="contents-head">
        <h3>목차</h3>
        <button
          type="button"
          className="secondary"
          disabled={busy || tree === undefined}
          onClick={() => startAdd()}
        >
          장 추가
        </button>
      </div>
      {open && (
        // Keyed by its target so the title field takes focus again for each new add or edit.
        <form
          key={open.id ?? `under-${open.parentId}`}
          className="log-form content-form"
          onSubmit={save}
        >
          <p className="wide content-form-heading">{open.heading}</p>
          <label>
            번호
            <input
              maxLength={20}
              placeholder="예: 1.2"
              disabled={busy}
              value={open.number}
              onChange={change('number')}
            />
          </label>
          <label className="title">
            목차 제목
            <input
              autoFocus
              required
              maxLength={200}
              disabled={busy}
              value={open.title}
              onChange={change('title')}
            />
          </label>
          <div className="actions wide">
            <button type="submit" className="primary" disabled={busy}>
              {open.id === undefined ? '추가' : '수정 저장'}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => setEditor(undefined)}
            >
              취소
            </button>
          </div>
        </form>
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
          목차를 불러오지 못했습니다: {error}
        </p>
      )}
      {tree === undefined ? (
        !error && <p className="status">불러오는 중…</p>
      ) : tree.length === 0 ? (
        <p className="status">아직 목차가 없습니다</p>
      ) : (
        renderNodes(tree, null)
      )}
    </div>
  );
}
