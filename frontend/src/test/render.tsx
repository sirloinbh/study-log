import { QueryClientProvider } from '@tanstack/react-query';
import { render as baseRender, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

import { createQueryClient } from '../lib/query';

// Screens load through the shared query layer (#287), so they render inside a QueryClientProvider.
// A fresh client per render keeps one test's cache from answering the next one. Data is always stale
// and a failed load is not retried, so a test sees each request it triggers right away.
export function render(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  const client = createQueryClient({
    defaultOptions: { queries: { staleTime: 0, retry: false, gcTime: 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { ...baseRender(ui, { ...options, wrapper }), client };
}
