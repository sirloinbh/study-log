import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { expect, test } from 'vitest';

import { useBusy } from './busy';

function Form({ focusTarget }: { focusTarget?: boolean }) {
  const { busy, begin, end } = useBusy();
  const [wantFocus, setWantFocus] = useState(false);
  useEffect(() => {
    if (wantFocus && !busy) document.getElementById('other')?.focus();
  }, [wantFocus, busy]);
  const save = () => {
    if (!begin()) return;
    if (focusTarget) setWantFocus(true);
    setTimeout(end, 10);
  };
  return (
    <div>
      <button type="button" disabled={busy} onClick={save}>
        Save
      </button>
      <button type="button" id="other">
        Other
      </button>
    </div>
  );
}

test('the button that started a request has focus again once it is over', async () => {
  render(<Form />);
  const save = screen.getByRole('button', { name: 'Save' });
  save.focus();
  fireEvent.click(save);
  await waitFor(() => expect(save).toBeDisabled());
  // A disabled element does not keep focus in the browser; the test stands in for that.
  save.blur();
  await waitFor(() => expect(save).toBeEnabled());
  await waitFor(() => expect(save).toHaveFocus());
});

test('a screen that moves focus itself keeps its own target', async () => {
  render(<Form focusTarget />);
  const save = screen.getByRole('button', { name: 'Save' });
  save.focus();
  fireEvent.click(save);
  await waitFor(() => expect(save).toBeDisabled());
  save.blur();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Other' })).toHaveFocus());
});
