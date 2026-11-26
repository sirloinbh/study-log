import { useEffect, useId, useRef } from 'react';

import { Button } from './components/ui/button';

// A file field with English text (#446). The browser's own "Choose file / No file chosen" follows the
// browser language, so the native input is visually hidden (it stays in the tab order, so the label,
// the keyboard and screen readers work as before) and a button plus the file name are shown instead.
// `file` is the screen's chosen file: when it goes back to undefined the input is cleared too, so
// choosing the same file again fires a change.
export function FileField({
  label,
  accept,
  file,
  disabled,
  clearAfterPick,
  onFile,
  className,
}: {
  label: string;
  accept: string;
  file: File | undefined;
  disabled?: boolean;
  /** For a file that is used as soon as it is picked: the input is emptied, so picking it again fires a change. */
  clearAfterPick?: boolean;
  onFile: (file: File | undefined) => void;
  className?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file && input.current) input.current.value = '';
  }, [file]);

  return (
    <div className={`grid gap-1.5 text-[13px] font-medium ${className ?? ''}`}>
      <label htmlFor={id}>{label}</label>
      {/* The button shows the keyboard focus of the hidden input. */}
      <div className="flex min-w-0 items-center gap-2 has-[input:focus-visible]:[&_button]:ring-[3px] has-[input:focus-visible]:[&_button]:ring-ring/50">
        <input
          ref={input}
          id={id}
          type="file"
          accept={accept}
          disabled={disabled}
          className="sr-only"
          onChange={(event) => {
            const picked = event.target.files?.[0];
            if (clearAfterPick) event.target.value = '';
            onFile(picked);
          }}
        />
        <Button
          type="button"
          variant="outline"
          tabIndex={-1}
          aria-hidden="true"
          disabled={disabled}
          onClick={() => input.current?.click()}
        >
          Choose file
        </Button>
        <span className="min-w-0 truncate font-normal text-muted-foreground" data-file-name>
          {file ? file.name : 'No file chosen'}
        </span>
      </div>
    </div>
  );
}
