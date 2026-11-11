import React from 'react';

import { SkeletonCard, SkeletonList, SkeletonText } from './components/ui/skeleton';
import { Spinner } from './components/ui/spinner';

// A part of the screen on its way (#118): placeholders shaped like what comes, under aria-busy.
// The sentence beside them, not inside, is what screen readers announce; a live region inside a
// busy one may stay silent.
export function Loading({
  label,
  kind = 'list',
}: {
  label: string;
  kind?: 'list' | 'text' | 'cards';
}) {
  return (
    <>
      <p role="status" className="sr-only">
        {label}…
      </p>
      <div
        role="group"
        aria-busy="true"
        aria-label={label}
        className={kind === 'cards' ? 'metric-grid' : undefined}
      >
        {kind === 'list' && <SkeletonList />}
        {kind === 'text' && <SkeletonText />}
        {kind === 'cards' && (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}
      </div>
    </>
  );
}

// Inside a button whose save or delete is under way; the button itself is already disabled. No top
// margin: the screens' message rule for [role='status'] (style.css) also reaches this spinner.
export function ButtonSpinner({ when }: { when: boolean }) {
  return when ? <Spinner size="sm" label="Working" className="mt-0" /> : null;
}
