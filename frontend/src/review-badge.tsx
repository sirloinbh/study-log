import { BellRing } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';

import { Badge } from './components/ui/badge';
import { apiKey, useApiQuery } from './lib/query';
import { plural } from './plural';

// The top bar link to the reviews page, shown while reviews are due (#44). It sits in the top bar
// because on a phone the menu is folded away. It counts again on each page change, after a change
// the pages report (`version`), when the service date changes (`day`), and on returning to the tab, which may have been left overnight.
// A failed count keeps the last one: the page itself reports server problems.
export function ReviewBadge({ to, version, day }: { to: string; version: number; day?: string }) {
  const [returned, setReturned] = useState(0);
  const { pathname } = useLocation();

  useEffect(() => {
    const onFocus = () => setReturned((times) => times + 1);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // Each trigger is its own key, so it counts again, and a slower, older answer never replaces a newer one.
  const query = useApiQuery<{ count: number }>(
    apiKey('/api/reviews/today/count', version, day, pathname, returned),
    '/api/reviews/today/count',
  );
  // A failed or pending count keeps the last one shown.
  const last = useRef(0);
  if (query.data) last.current = query.data.count;
  const count = last.current;

  if (count === 0) return null;
  return (
    <Link
      to={to}
      aria-label={`${plural(count, 'review')} today`}
      className="flex min-h-11 items-center gap-1.5 rounded-md px-2 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <BellRing className="size-4 shrink-0" aria-hidden />
      <Badge variant="destructive">{count}</Badge>
    </Link>
  );
}
