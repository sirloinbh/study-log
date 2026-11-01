import { useRef, useState } from 'react';

// One request at a time. `busy` drives the disabled controls; the ref is the real guard, because
// two submits in the same tick (a fast double Enter) both still see the `busy` of the last
// render (#75). `begin` returns false when a request is already running.
//
// `action` tells the buttons which request it is (#118), so only the one that was pressed shows it
// is waiting. A handler calls `nameNext` just before the request it starts.
export function useBusy() {
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<string>();
  const pending = useRef(false);
  const named = useRef<string | undefined>(undefined);
  const nameNext = (name: string) => {
    named.current = name;
  };
  const begin = () => {
    const name = named.current;
    named.current = undefined;
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    setAction(name);
    return true;
  };
  const end = () => {
    pending.current = false;
    setBusy(false);
    setAction(undefined);
  };
  return { busy, action, nameNext, begin, end };
}
