import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { expect, test, vi } from 'vitest';

import { FileField } from './file-field';

function Harness({ onFile = () => {} }: { onFile?: (file: File | undefined) => void }) {
  const [file, setFile] = useState<File>();
  return (
    <>
      <FileField
        label="Excel file"
        accept=".xlsx"
        file={file}
        onFile={(picked) => {
          setFile(picked);
          onFile(picked);
        }}
      />
      <button type="button" onClick={() => setFile(undefined)}>
        Reset
      </button>
    </>
  );
}

const input = () => screen.getByLabelText<HTMLInputElement>('Excel file');

test('the field shows English text, and the label and accept list stay on the native input', () => {
  render(<Harness />);
  expect(screen.getByText('Choose file')).toBeInTheDocument();
  expect(screen.getByText('No file chosen')).toBeInTheDocument();
  expect(input()).toHaveAttribute('type', 'file');
  expect(input()).toHaveAttribute('accept', '.xlsx');
  // Hidden from sight only: the input stays focusable, so keyboard users reach it.
  expect(input()).toHaveClass('sr-only');
  expect(input()).not.toHaveAttribute('tabindex', '-1');
});

test('picking a file shows its name and hands it on; clearing goes back to "No file chosen"', () => {
  const onFile = vi.fn();
  render(<Harness onFile={onFile} />);
  const file = new File(['x'], 'goals.xlsx');
  fireEvent.change(input(), { target: { files: [file] } });
  expect(screen.getByText('goals.xlsx')).toBeInTheDocument();
  expect(onFile).toHaveBeenCalledWith(file);
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  expect(screen.getByText('No file chosen')).toBeInTheDocument();
});

test('the button opens the file dialog of the native input', () => {
  render(<Harness />);
  const open = vi.spyOn(input(), 'click');
  fireEvent.click(screen.getByText('Choose file'));
  expect(open).toHaveBeenCalledOnce();
});
