import { useRef, useState } from 'react';

// One request at a time. `busy` drives the disabled controls; the ref is the real guard, because
// two submits in the same tick (a fast double Enter) both still see the `busy` of the last
// render (#75). `begin` returns false when a request is already running.
export function useBusy() {
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const begin = () => {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    return true;
  };
  const end = () => {
    pending.current = false;
    setBusy(false);
  };
  return { busy, begin, end };
}
