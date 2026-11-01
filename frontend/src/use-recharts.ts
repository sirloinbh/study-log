import { useEffect, useState } from 'react';

type Recharts = typeof import('recharts');
// Recharts is loaded on first use, so the rest of the app does not carry it; kept once loaded.
let loadedRecharts: Recharts | undefined;

export function useRecharts() {
  const [charts, setCharts] = useState<Recharts | undefined>(() => loadedRecharts);
  const [chartError, setChartError] = useState<string>();
  useEffect(() => {
    if (charts) return;
    let current = true;
    import('recharts')
      .then((module) => {
        loadedRecharts = module;
        if (current) setCharts(module);
      })
      .catch((error: Error) => {
        if (current) setChartError(error.message);
      });
    return () => {
      current = false;
    };
  }, [charts]);
  return { charts, chartError };
}
