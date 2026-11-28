import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import type { GoalItem, GoalListRow } from './coding';
import { CodingGoalDay } from './coding-goal-day';
import { CodingGoalList } from './coding-goal-list';
import { CodingGoals } from './coding-goals';
import { CodingProblems } from './coding-problems';
import { type Answer, fakeApi, type Sent } from './test/fake-api';
import { render } from './test/render';

// jsdom has no ResizeObserver; the Radix controls measure themselves with one.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const item = (n: number, extra: Partial<GoalItem> = {}): GoalItem => ({
  id: n,
  listId: 1,
  site: 'baekjoon',
  problemKey: String(1000 + n),
  title: `Problem ${n}`,
  group: '1단계',
  topic: n % 2 ? '입출력' : '수학',
  level: 1,
  targetDate: null,
  dueDate: null,
  position: n,
  problemId: null,
  attemptCount: 0,
  solvedDate: null,
  state: 'left',
  ...extra,
});
const items: GoalItem[] = [
  item(1, { state: 'solved', solvedDate: '2026-11-20', problemId: 11, attemptCount: 2 }),
  item(2, { state: 'late', dueDate: '2026-11-20' }),
  item(3),
  item(4, { state: 'solved', solvedDate: '2026-09-01', problemId: 14, attemptCount: 1 }),
];
const progress = { total: 4, solved: 2, late: 1, weekPlanned: 1, weekSolved: 0 };

const row = (extra: Partial<GoalListRow> = {}): GoalListRow => ({
  id: 1,
  name: 'Baekjoon 500',
  targetDate: null,
  ...progress,
  alreadyLogged: 2,
  next: [items[1], items[2]],
  ...extra,
});

describe('goal list progress', () => {
  test('a list shows its bar, the late and weekly counts, filters and its problems in order', async () => {
    fakeApi({ '/api/coding/goals/1': { body: { progress, items } } });
    const opened: GoalItem[] = [];
    render(<CodingGoalList id={1} name="Baekjoon 500" onOpenProblem={(i) => opened.push(i)} />);
    const bar = await screen.findByRole('progressbar', { name: 'Baekjoon 500 progress' });
    expect(bar.getAttribute('aria-valuenow')).toBe('2');
    expect(bar.getAttribute('aria-valuemax')).toBe('4');
    expect(screen.getByText('2 of 4 solved (50%), 1 late, this week 0 of 1 due')).toBeTruthy();
    expect(screen.getAllByRole('listitem').map((li) => li.getAttribute('data-state'))).toEqual([
      'solved',
      'late',
      'left',
      'solved',
    ]);
    expect(screen.getByText('Solved 2026-11-20')).toBeTruthy();
    expect(screen.getByText('Late, was due 2026-11-20')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'left' } });
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'late' } });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('Topic'), { target: { value: '수학' } });
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toHaveLength(2);

    fireEvent.change(screen.getByLabelText('Topic'), { target: { value: '' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Open attempts/ })[0]);
    expect(opened[0].problemId).toBe(11);
    // An item without a problem in the log has no attempts to open.
    expect(screen.getAllByRole('button', { name: /Open attempts/ })).toHaveLength(2);
  });

  test('a long list shows 50 at a time', async () => {
    const many = Array.from({ length: 120 }, (_, i) => item(i + 1));
    fakeApi({
      '/api/coding/goals/1': {
        body: { progress: { ...progress, total: 120, solved: 0 }, items: many },
      },
    });
    render(<CodingGoalList id={1} name="Big" onOpenProblem={() => undefined} />);
    await screen.findByRole('progressbar');
    expect(screen.getAllByRole('listitem')).toHaveLength(50);
    fireEvent.click(screen.getByRole('button', { name: 'Show more (70 left)' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(100);
  });

  test('the lists on the Coding screen show progress and the next problems, and open a list', async () => {
    fakeApi({
      '/api/coding/goals': { body: { lists: [row()] } },
      '/api/coding/goals/1': { body: { progress, items } },
    });
    render(<CodingGoals notify={() => undefined} onOpenProblem={() => undefined} />);
    const lists = await screen.findByLabelText('Your goal lists');
    expect(within(lists).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('2');
    expect(lists.textContent).toContain('Next: Problem 2 (1002), Problem 3 (1003)');
    fireEvent.click(within(lists).getByRole('button', { name: 'Baekjoon 500 problems' }));
    expect(await screen.findByRole('region', { name: 'Baekjoon 500 problems' })).toBeTruthy();
  });

  test('Open attempts filters the problem log to that problem and opens its attempts', async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const problem = {
      id: 11,
      site: 'baekjoon',
      problemKey: '1001',
      title: 'Problem 1',
      url: null,
      level: null,
      tags: [],
      difficulty: null,
      attemptCount: 2,
      totalMinutes: 20,
      lastAttemptDate: '2026-11-20',
      lastResult: 'solved',
    };
    const api = fakeApi(({ path, method }: Sent): Answer | undefined => {
      if (path === '/api/coding/summary')
        return {
          body: {
            today: { attempts: 0, solved: 0, minutes: 0 },
            week: { attempts: 0, solved: 0, minutes: 0 },
            streak: 0,
            lastLanguage: '',
          },
        };
      if (path === '/api/coding/goals') return { body: { lists: [row()] } };
      if (path === '/api/coding/goals/1') return { body: { progress, items } };
      if (path.split('?')[0] === '/api/coding/problems' && method === 'GET')
        return { body: { problems: [problem] } };
      if (path === '/api/coding/problems/11') return { body: { problem, attempts: [] } };
      return undefined;
    });
    render(<CodingProblems today="2026-11-26" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Baekjoon 500 problems' }));
    fireEvent.click((await screen.findAllByRole('button', { name: /Open attempts/ }))[0]);
    await waitFor(() =>
      expect(api.requests.some((r) => r.path === '/api/coding/problems?site=baekjoon&q=1001')).toBe(
        true,
      ),
    );
    expect(await screen.findByLabelText('Attempts for Problem 1')).toBeTruthy();
    expect(scroll).toHaveBeenCalled();
  });
});

describe('quick log with goal lists', () => {
  test('the next goal problems come first, and one that is not in the log yet is added with its title', async () => {
    const api = fakeApi(({ path, method, body }: Sent): Answer | undefined => {
      if (path === '/api/coding/summary')
        return {
          body: {
            today: { attempts: 0, solved: 0, minutes: 0 },
            week: { attempts: 0, solved: 0, minutes: 0 },
            streak: 0,
            lastLanguage: 'Python',
          },
        };
      if (path === '/api/coding/goals') return { body: { lists: [row()] } };
      if (path.split('?')[0] === '/api/coding/problems' && method === 'GET')
        return { body: { problems: [] } };
      if (path === '/api/coding/problems' && method === 'POST')
        return { status: 201, body: { problem: body, attempts: [] } };
      return undefined;
    });
    render(<CodingProblems today="2026-11-26" />);
    const quick = await screen.findByLabelText('Log a solve');
    const next = await within(quick).findByRole('button', { name: 'Next: Problem 3 (1003)' });
    expect(within(quick).getByRole('button', { name: 'Next: Problem 2 (1002)' })).toBeTruthy();
    fireEvent.click(next);
    fireEvent.click(within(quick).getByRole('button', { name: 'Save solve' }));
    await waitFor(() => expect(api.requests.some((r) => r.method === 'POST')).toBe(true));
    expect(api.requests.find((r) => r.method === 'POST')?.body).toMatchObject({
      site: 'baekjoon',
      problemKey: '1003',
      title: 'Problem 3',
      attempt: { result: 'solved', language: 'Python' },
    });
    // No solved.ac lookup: the list already gave the title.
    expect(api.requests.some((r) => r.path.includes('/solvedac/'))).toBe(false);
  });

  test('a goal problem that is already in the log gets an attempt on it', async () => {
    const logged = row({ next: [items[0]] });
    const api = fakeApi(({ path, method }: Sent): Answer | undefined => {
      if (path === '/api/coding/summary')
        return {
          body: {
            today: { attempts: 0, solved: 0, minutes: 0 },
            week: { attempts: 0, solved: 0, minutes: 0 },
            streak: 0,
            lastLanguage: '',
          },
        };
      if (path === '/api/coding/goals') return { body: { lists: [logged] } };
      if (path.split('?')[0] === '/api/coding/problems' && method === 'GET')
        return { body: { problems: [] } };
      if (path === '/api/coding/problems/11/attempts' && method === 'POST')
        return { status: 201, body: { attempt: {} } };
      return undefined;
    });
    render(<CodingProblems today="2026-11-26" />);
    const quick = await screen.findByLabelText('Log a solve');
    fireEvent.click(await within(quick).findByRole('button', { name: 'Next: Problem 1 (1001)' }));
    fireEvent.click(within(quick).getByRole('button', { name: 'Save solve' }));
    await waitFor(() =>
      expect(api.requests.some((r) => r.path === '/api/coding/problems/11/attempts')).toBe(true),
    );
  });
});

describe('algorithm goals on the Algorithms page', () => {
  const day = (lists: unknown[]) => ({
    '/api/coding/goals/today': { body: { date: '2026-11-26', lists } },
  });

  test('shows what is due, what was solved today and the next problems per list', async () => {
    fakeApi(
      day([
        {
          id: 1,
          name: 'Baekjoon 500',
          planned: [items[0], items[1]],
          solved: [items[0]],
          next: [items[2]],
        },
      ]),
    );
    render(<CodingGoalDay date="2026-11-26" />);
    const card = await screen.findByLabelText('Algorithm goals today');
    expect(card.textContent).toContain('Due today: 1 of 2 solved');
    expect(card.textContent).toContain('Solved today: Problem 1');
    expect(card.textContent).toContain('Next: Problem 3 (1003)');
    expect(card.textContent).toContain('Still to do today: Problem 2');
  });

  test('the Algorithms page shows the goal block above the quick log (#477)', async () => {
    fakeApi(({ path, method }: Sent): Answer | undefined => {
      if (path.startsWith('/api/coding/goals/today'))
        return {
          body: {
            date: '2026-11-26',
            lists: [
              { id: 1, name: 'Baekjoon 500', planned: [items[0]], solved: [], next: [items[2]] },
            ],
          },
        };
      if (path === '/api/coding/summary')
        return {
          body: {
            today: { attempts: 0, solved: 0, minutes: 0 },
            week: { attempts: 0, solved: 0, minutes: 0 },
            streak: 0,
            lastLanguage: 'Python',
          },
        };
      if (path === '/api/coding/goals') return { body: { lists: [] } };
      if (path.split('?')[0] === '/api/coding/problems' && method === 'GET')
        return { body: { problems: [] } };
      return undefined;
    });
    render(<CodingProblems today="2026-11-26" />);
    const card = await screen.findByLabelText('Algorithm goals today');
    const quick = await screen.findByRole('region', { name: 'Log a solve' });
    expect(card.compareDocumentPosition(quick) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('shows nothing without a goal list', async () => {
    const api = fakeApi(day([]));
    const { container } = render(<CodingGoalDay date="2026-11-26" />);
    await waitFor(() => expect(api.requests.length).toBeGreaterThan(0));
    expect(container.textContent).toBe('');
  });
});
