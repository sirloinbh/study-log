import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { expect, test, vi } from 'vitest';

import { DeleteConfirm } from './delete-confirm';

function Harness({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <DeleteConfirm
      open={open}
      title="Delete this?"
      // As on the screens: the item is gone once the delete is done.
      onConfirm={async () => {
        await onConfirm();
        setOpen(false);
      }}
      onCancel={() => {
        setOpen(false);
        onCancel();
      }}
    />
  );
}

test('Cancel reports a cancel, confirming does not', async () => {
  const onCancel = vi.fn();
  const onConfirm = vi.fn(() => Promise.resolve());
  const { unmount } = render(<Harness onConfirm={onConfirm} onCancel={onCancel} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
  expect(onConfirm).not.toHaveBeenCalled();
  unmount();

  const second = vi.fn();
  render(<Harness onConfirm={onConfirm} onCancel={second} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(second).not.toHaveBeenCalled();
});
