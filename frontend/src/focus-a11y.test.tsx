import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { Exercises } from './exercises';
import { Keywords } from './keywords';
import { Memo } from './memo';
import { StudyLogs } from './study-logs';
import { fakeApi } from './test/fake-api';
import { render } from './test/render';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test('Edit on a keyword moves focus to the edit form', async () => {
  fakeApi({
    'GET /api/keywords': {
      body: { keywords: [{ id: 1, date: '2026-10-23', keyword: 'vector', memo: '' }] },
    },
    'GET /api/keywords/used': { body: { keywords: ['vector'] } },
  });
  render(<Keywords today="2026-10-23" />);
  fireEvent.click(await screen.findByRole('button', { name: 'vector edit' }));
  await waitFor(() => expect(document.activeElement?.id).toBe('keyword-edit-keyword'));
});

test('Edit on a study log moves focus to the date field', async () => {
  fakeApi({
    'GET /api/textbooks': { body: { textbooks: [] } },
    'GET /api/study-logs/calendar': { body: { month: '2026-10', days: [] } },
    'GET /api/study-logs': {
      body: {
        studyLogs: [
          {
            id: 1,
            studyDate: '2026-10-21',
            startTime: '09:00',
            endTime: '10:30',
            durationMinutes: 90,
            memo: 'matrix',
            status: 'done',
            textbookId: null,
            textbookTitle: null,
            contentId: null,
            contentNumber: null,
            contentTitle: null,
            understanding: null,
            goalAchieved: null,
            studyType: 'new',
          },
        ],
      },
    },
  });
  render(<StudyLogs today="2026-10-23" />);
  fireEvent.click(await screen.findByRole('button', { name: /Edit log/ }));
  await waitFor(() => expect(document.activeElement?.id).toBe('study-log-date'));
});

test('closing the extraction panel returns focus to "Read from file"', async () => {
  fakeApi({ 'GET /api/textbooks/1/contents/10/exercises': { body: { exercises: [] } } });
  render(
    <Exercises
      textbook={{ id: 1, title: 'Linear algebra', author: '', edition: '' }}
      tree={[{ id: 10, number: '1', title: 'Vectors', children: [] }]}
    />,
  );
  const open = await screen.findByRole('button', { name: 'Read from file' });
  await waitFor(() => expect(open).toBeEnabled());
  fireEvent.click(open);
  fireEvent.click(await screen.findByRole('button', { name: 'Close' }));
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Read from file' })),
  );
});

test('a clamped memo takes its cut-off links out of the tab order', () => {
  // jsdom has no layout: the box is 60px tall, the second link sits below it.
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(60);
  vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.textContent === 'hidden' ? 120 : 10;
  });
  render(<Memo clamp text={'[shown](https://a.example)\n\n[hidden](https://b.example)'} />);
  expect(screen.getByRole('link', { name: 'shown' })).not.toHaveAttribute('tabindex');
  expect(screen.getByRole('link', { name: 'hidden' })).toHaveAttribute('tabindex', '-1');
});

test('an unclamped memo keeps all its links tabbable', () => {
  render(<Memo text={'[one](https://a.example)'} />);
  expect(screen.getByRole('link', { name: 'one' })).not.toHaveAttribute('tabindex');
});
