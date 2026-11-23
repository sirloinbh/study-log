import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { DataExport } from './data-export';
import { exportPath } from './export-path';

const link = (name: RegExp) => screen.getByRole('link', { name });

test('the address leaves out a blank end of the range and encodes the rest', () => {
  expect(exportPath('/api/export/study-logs.csv', '', '')).toBe('/api/export/study-logs.csv');
  expect(exportPath('/api/export/study-logs.csv', '2026-11-01', '')).toBe(
    '/api/export/study-logs.csv?from=2026-11-01',
  );
  expect(exportPath('/api/export/exercises.md', '2026-11-01', '2026-11-30')).toBe(
    '/api/export/exercises.md?from=2026-11-01&to=2026-11-30',
  );
});

test('three downloads follow the range typed in', () => {
  render(<DataExport />);
  expect(link(/study logs/)).toHaveAttribute('href', '/api/export/study-logs.csv');
  expect(link(/study logs/)).toHaveAttribute('download');
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-01' } });
  fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-30' } });
  expect(link(/study logs/)).toHaveAttribute(
    'href',
    '/api/export/study-logs.csv?from=2026-11-01&to=2026-11-30',
  );
  expect(link(/exercises/)).toHaveAttribute(
    'href',
    '/api/export/exercises.md?from=2026-11-01&to=2026-11-30',
  );
  expect(link(/retrospectives/)).toHaveAttribute(
    'href',
    '/api/export/retrospectives.md?from=2026-11-01&to=2026-11-30',
  );
});

test('a start date after the end date says so and offers no download', () => {
  render(<DataExport />);
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-30' } });
  fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-01' } });
  expect(screen.getByRole('alert')).toHaveTextContent(
    'The start date cannot be after the end date',
  );
  expect(screen.queryByRole('link', { name: /Download/ })).toBeNull();
});
