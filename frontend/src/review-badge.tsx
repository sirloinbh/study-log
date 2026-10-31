import { BellRing } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';

import { requestJson } from './api';
import { Badge } from './components/ui/badge';

// The top bar link to the reviews page, shown while reviews are due (#44). It sits in the top bar
// because on a phone the menu is folded away. It counts again on each page change, after a change
// the pages report (`version`), and on returning to the tab, which may have been left overnight.
// A failed count keeps the last one: the page itself reports server problems.
export function ReviewBadge({ to, version }: { to: string; version: number }) {
  const [count, setCount] = useState(0);
  const [returned, setReturned] = useState(0);
  const { pathname } = useLocation();

  useEffect(() => {
    const onFocus = () => setReturned((times) => times + 1);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  useEffect(() => {
    // A slower, older answer must not overwrite the count a newer request returned.
    let current = true;
    requestJson<{ count: number }>('/api/reviews/today/count')
      .then((data) => {
        if (current) setCount(data.count);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [version, pathname, returned]);

  if (count === 0) return null;
  return (
    <Link
      to={to}
      aria-label={`오늘 복습 ${count}개`}
      className="flex min-h-11 items-center gap-1.5 rounded-md px-2 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <BellRing className="size-4 shrink-0" aria-hidden />
      <Badge variant="destructive">{count}</Badge>
    </Link>
  );
}
