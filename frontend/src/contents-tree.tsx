import { Button } from './components/ui/button';
import { DeleteConfirm } from './delete-confirm';
import { contentLabel, type ContentNode } from './textbook';

// The contents as a tree (#23): each entry with up, down, add child, edit and delete, or the
// confirmation that replaces them while a delete is asked for. The parent does the work.
export function ContentsTree({
  nodes,
  parentId,
  openId,
  deletingId,
  busy,
  onMove,
  onAddChild,
  onEdit,
  onAskDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  nodes: ContentNode[];
  parentId: number | null;
  openId: number | undefined;
  deletingId: number | undefined;
  busy: boolean;
  onMove: (siblings: ContentNode[], index: number, step: -1 | 1, parentId: number | null) => void;
  onAddChild: (node: ContentNode) => void;
  onEdit: (node: ContentNode) => void;
  onAskDelete: (node: ContentNode) => void;
  onConfirmDelete: (node: ContentNode) => Promise<unknown>;
  onCancelDelete: (node: ContentNode) => void;
}) {
  return (
    <ul className="content-tree">
      {nodes.map((node, index) => {
        const label = contentLabel(node);
        return (
          <li key={node.id}>
            <div className={openId === node.id ? 'content-row editing' : 'content-row'}>
              <span className="content-label">{label}</span>
              <div className="log-actions">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || index === 0}
                  aria-label={`Move up: ${label}`}
                  onClick={() => onMove(nodes, index, -1, parentId)}
                >
                  Up
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || index === nodes.length - 1}
                  aria-label={`Move down: ${label}`}
                  onClick={() => onMove(nodes, index, 1, parentId)}
                >
                  Down
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  aria-label={`Add child: ${label}`}
                  onClick={() => onAddChild(node)}
                >
                  Add child
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  aria-label={`Edit contents entry: ${label}`}
                  onClick={() => onEdit(node)}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  id={`content-delete-${node.id}`}
                  aria-label={`Delete contents entry: ${label}`}
                  onClick={() => onAskDelete(node)}
                >
                  Delete
                </Button>
                <DeleteConfirm
                  open={deletingId === node.id}
                  title="Delete this contents entry?"
                  description={label}
                  onConfirm={() => onConfirmDelete(node)}
                  onCancel={() => onCancelDelete(node)}
                />
              </div>
            </div>
            {node.children.length > 0 && (
              <ContentsTree
                nodes={node.children}
                parentId={node.id}
                openId={openId}
                deletingId={deletingId}
                busy={busy}
                onMove={onMove}
                onAddChild={onAddChild}
                onEdit={onEdit}
                onAskDelete={onAskDelete}
                onConfirmDelete={onConfirmDelete}
                onCancelDelete={onCancelDelete}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
