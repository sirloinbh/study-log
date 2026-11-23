import type * as React from 'react';
import { useRef } from 'react';

import { ConfirmDialog } from './components/ui/confirm-dialog';

// The "are you sure" step before a delete, on the shared ConfirmDialog (#346). The screen keeps which item is being
// confirmed (`open`) and does the work in `onConfirm`; this only turns the dialog's close into "cancelled" when the
// user backs out, not when the delete itself closes it. Closing hands focus back to the button that opened it; after a
// delete that button is gone, so the screen's own focus step (the list heading) takes over.
export function DeleteConfirm({
  open,
  title,
  description,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  onConfirm: () => void | Promise<unknown>;
  onCancel: () => void;
}) {
  const confirmed = useRef(false);
  return (
    <ConfirmDialog
      open={open}
      title={title}
      description={description}
      confirmLabel="Delete"
      onConfirm={() => {
        confirmed.current = true;
        return onConfirm();
      }}
      onOpenChange={(next) => {
        if (next) return;
        if (confirmed.current) confirmed.current = false;
        else onCancel();
      }}
    />
  );
}
