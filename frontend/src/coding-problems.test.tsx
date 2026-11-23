import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { tierLabel } from './coding';
import { CodingProblems } from './coding-problems';
import { type Answer, fakeApi, type Sent } from './test/fake-api';
import { render } from './test/render';

// jsdom has no ResizeObserver; the Radix checkbox in a form measures itself with one.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const today = '2026-11-23';

type Attempt = {
  id: number;
  date: string;
  result: string;
  language: string;
  minutes: number | null;
  notes: string;
  studyLogId: number | null;
};
type Problem = {
  id: number;
  site: string;
  problemKey: string;
  title: string;
  url: string | null;
  level?: number | null;
  tags?: string[];
  difficulty?: string | null;
};

// In-memory coding API: problems with attempts, the latest attempt decides the list's result.
function server(initial: { problem: Problem; attempts: Attempt[] }[] = []) {
  const rows = initial.map((row) => ({ ...row, attempts: [...row.attempts] }));
  let nextId = 100;
  const summary = (row: (typeof rows)[number]) => {
    const latest = [...row.attempts].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    return {
      level: null,
      tags: [],
      difficulty: null,
      ...row.problem,
      attemptCount: row.attempts.length,
      totalMinutes: row.attempts.reduce((sum, a) => sum + (a.minutes ?? 0), 0),
      lastAttemptDate: latest?.date ?? null,
      lastResult: latest?.result ?? null,
    };
  };
  const answer = ({ method, path, body }: Sent): Answer | undefined => {
    const [base, query = ''] = path.split('?');
    if (base === '/api/coding/solvedac/problems/1000')
      return {
        body: {
          problem: {
            id: 1000,
            title: 'A+B',
            level: 1,
            tags: ['math', 'implementation'],
            url: 'https://www.acmicpc.net/problem/1000',
          },
        },
      };
    if (base.startsWith('/api/coding/solvedac/problems/'))
      return { status: 503, body: { error: 'Could not reach solved.ac. Try again in a moment' } };
    if (base === '/api/coding/leetcode/import' && method === 'POST')
      return { body: { added: 4, skipped: 0, total: 4 } };
    if (base === '/api/coding/solvedac/import' && method === 'POST')
      return { body: { added: 2, skipped: 1, total: 3 } };
    const input = body as Record<string, unknown> | undefined;
    if (base === '/api/coding/problems' && method === 'GET') {
      const params = new URLSearchParams(query);
      return {
        body: {
          problems: rows
            .map(summary)
            .filter(
              (p) =>
                (!params.get('site') || p.site === params.get('site')) &&
                (!params.get('result') || p.lastResult === params.get('result')),
            ),
        },
      };
    }
    if (base === '/api/coding/problems' && method === 'POST' && input) {
      const problem = {
        id: nextId++,
        site: String(input.site),
        problemKey: String(input.problemKey),
        title: String(input.title),
        url: null,
      };
      if (
        rows.some(
          (r) => r.problem.site === problem.site && r.problem.problemKey === problem.problemKey,
        )
      )
        return {
          status: 409,
          body: { error: 'This problem is already recorded. Add an attempt to it instead' },
        };
      const attempts = input.attempt
        ? [
            {
              id: nextId++,
              studyLogId: null,
              ...(input.attempt as Omit<Attempt, 'id' | 'studyLogId'>),
            },
          ]
        : [];
      rows.push({ problem, attempts });
      return { status: 201, body: { problem, attempts } };
    }
    const one = base.match(/^\/api\/coding\/problems\/(\d+)(\/attempts)?$/);
    if (one) {
      const row = rows.find((r) => r.problem.id === Number(one[1]));
      if (!row) return { status: 404, body: { error: 'Problem not found' } };
      if (one[2] && method === 'POST' && input) {
        const attempt = {
          id: nextId++,
          studyLogId: null,
          ...(input as Omit<Attempt, 'id' | 'studyLogId'>),
        };
        row.attempts.push(attempt);
        return { status: 201, body: { attempt } };
      }
      if (method === 'DELETE') {
        rows.splice(rows.indexOf(row), 1);
        return { status: 204 };
      }
      return { body: { problem: row.problem, attempts: row.attempts } };
    }
    const attemptRoute = base.match(/^\/api\/coding\/attempts\/(\d+)$/);
    if (attemptRoute) {
      const row = rows.find((r) => r.attempts.some((a) => a.id === Number(attemptRoute[1])));
      if (!row) return { status: 404, body: { error: 'Attempt not found' } };
      const index = row.attempts.findIndex((a) => a.id === Number(attemptRoute[1]));
      if (method === 'PUT' && input) {
        row.attempts[index] = { ...row.attempts[index], ...input };
        return { body: { attempt: row.attempts[index] } };
      }
      row.attempts.splice(index, 1);
      return { status: 204 };
    }
    return undefined;
  };
  const api = fakeApi(answer);
  return { requests: api.requests, rows };
}

const baekjoon: Problem = {
  id: 1,
  site: 'baekjoon',
  problemKey: '1000',
  title: 'A+B',
  url: 'https://www.acmicpc.net/problem/1000',
};
const first: Attempt = {
  id: 10,
  date: '2026-11-20',
  result: 'failed',
  language: 'Python',
  minutes: 30,
  notes: 'timed out',
  studyLogId: null,
};

describe('coding problem log', () => {
  test('lists problems with the attempt count, minutes and latest result', async () => {
    server([{ problem: baekjoon, attempts: [first] }]);
    render(<CodingProblems today={today} />);
    expect(await screen.findByText('Baekjoon 1000')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'A+B' }).getAttribute('href')).toBe(
      'https://www.acmicpc.net/problem/1000',
    );
    expect(screen.getByText(/1 attempt, 30 min, latest 2026-11-20: Not solved/)).toBeTruthy();
  });

  test('adds a problem with its first attempt, and a repeat shows the server message', async () => {
    const api = server();
    render(<CodingProblems today={today} />);
    await screen.findByText('No problems yet');
    fireEvent.change(screen.getByLabelText('Problem ID'), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'A+B' } });
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'Python' } });
    fireEvent.change(screen.getByLabelText('Minutes spent'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add problem' }));
    expect(await screen.findByText('Baekjoon 1000')).toBeTruthy();
    const post = api.requests.find((r) => r.method === 'POST');
    expect(post?.body).toEqual({
      site: 'baekjoon',
      problemKey: '1000',
      title: 'A+B',
      attempt: { date: today, result: 'solved', language: 'Python', minutes: 15, notes: '' },
    });
    expect(screen.getByLabelText<HTMLInputElement>('Problem ID').value).toBe('');

    fireEvent.change(screen.getByLabelText('Problem ID'), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'A+B' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add problem' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/already recorded/);
  });

  test('the study log box is off by default, needs minutes and a start time, and is sent when ticked', async () => {
    const api = server();
    render(<CodingProblems today={today} />);
    await screen.findByText('No problems yet');
    const box = screen.getByRole('checkbox', { name: 'Also record a study log' });
    expect(box.getAttribute('aria-checked')).toBe('false');
    fireEvent.change(screen.getByLabelText('Problem ID'), { target: { value: '1001' } });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Sum' } });
    fireEvent.click(box);
    fireEvent.click(screen.getByRole('button', { name: 'Add problem' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Enter the minutes to also record a study log',
    );
    expect(api.requests.some((r) => r.method === 'POST')).toBe(false);

    fireEvent.change(screen.getByLabelText('Minutes spent'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Study log start time'), { target: { value: '09:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add problem' }));
    await screen.findByText('Baekjoon 1001');
    const post = api.requests.find((r) => r.method === 'POST');
    expect((post?.body as { attempt: object }).attempt).toMatchObject({
      minutes: 20,
      studyLog: { startTime: '09:30' },
    });
  });

  test('filters by site and result through the query string', async () => {
    const api = server([
      { problem: baekjoon, attempts: [first] },
      {
        problem: { id: 2, site: 'leetcode', problemKey: 'two-sum', title: 'Two Sum', url: null },
        attempts: [{ ...first, id: 11, result: 'solved' }],
      },
    ]);
    render(<CodingProblems today={today} />);
    await screen.findByText('LeetCode two-sum');
    fireEvent.change(within(screen.getByLabelText('Problems')).getByLabelText('Site'), {
      target: { value: 'leetcode' },
    });
    await waitFor(() => expect(screen.queryByText('Baekjoon 1000')).toBeNull());
    expect(api.requests.some((r) => r.path === '/api/coding/problems?site=leetcode')).toBe(true);
  });

  test('opens a problem to add, edit and delete attempts', async () => {
    server([{ problem: baekjoon, attempts: [first] }]);
    render(<CodingProblems today={today} />);
    fireEvent.click(await screen.findByRole('button', { name: 'A+B attempts' }));
    const detail = await screen.findByLabelText('Attempts for A+B');
    expect(await within(detail).findByText('timed out')).toBeTruthy();

    // Add a second attempt that solved it.
    fireEvent.change(within(detail).getAllByLabelText('Minutes spent').at(-1)!, {
      target: { value: '10' },
    });
    fireEvent.click(within(detail).getByRole('button', { name: 'Add attempt' }));
    await screen.findByText(/2 attempts, 40 min/);

    // Edit the first one.
    fireEvent.click(within(detail).getByRole('button', { name: '2026-11-20 attempt edit' }));
    fireEvent.change(within(detail).getAllByLabelText('Notes')[0], { target: { value: 'fixed' } });
    fireEvent.click(within(detail).getByRole('button', { name: 'Save attempt' }));
    expect(await within(detail).findByText('fixed')).toBeTruthy();

    // Delete it, with a confirmation.
    fireEvent.click(within(detail).getByRole('button', { name: '2026-11-20 attempt delete' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await screen.findByText(/1 attempt, 10 min/);
  });

  test('deleting a problem asks first and removes it', async () => {
    server([{ problem: baekjoon, attempts: [first] }]);
    render(<CodingProblems today={today} />);
    fireEvent.click(await screen.findByRole('button', { name: 'A+B delete' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('No problems yet')).toBeTruthy();
  });

  test('fills in the title, tier and tags from solved.ac and saves them with the problem', async () => {
    const api = server();
    render(<CodingProblems today={today} />);
    await screen.findByText('No problems yet');
    fireEvent.change(screen.getByLabelText('Problem ID'), { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fill in from solved.ac' }));
    await waitFor(() => expect(screen.getByLabelText<HTMLInputElement>('Title').value).toBe('A+B'));
    expect(screen.getByText('Bronze V, math, implementation')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add problem' }));
    await screen.findByText('Baekjoon 1000');
    const post = api.requests.find((r) => r.method === 'POST');
    expect(post?.body).toMatchObject({ level: 1, tags: ['math', 'implementation'] });
  });

  test('a failed lookup shows the message and leaves the form alone; other sites have no button', async () => {
    server();
    render(<CodingProblems today={today} />);
    await screen.findByText('No problems yet');
    fireEvent.change(screen.getByLabelText('Problem ID'), { target: { value: '1001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fill in from solved.ac' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Could not reach solved\.ac/);
    expect(screen.getByLabelText<HTMLInputElement>('Title').value).toBe('');
    fireEvent.change(within(screen.getByLabelText('Add a problem')).getByLabelText('Site'), {
      target: { value: 'leetcode' },
    });
    expect(screen.queryByRole('button', { name: 'Fill in from solved.ac' })).toBeNull();
  });

  test('imports the solved problems and says how many were added', async () => {
    const api = server();
    render(<CodingProblems today={today} />);
    await screen.findByText('No problems yet');
    fireEvent.click(screen.getByRole('button', { name: 'Import solved problems' }));
    expect(
      await screen.findByText('Imported from solved.ac: 2 added, 1 already recorded'),
    ).toBeTruthy();
    expect(api.requests.some((r) => r.path === '/api/coding/solvedac/import')).toBe(true);
  });

  test('tier names follow the solved.ac levels', () => {
    expect([0, 1, 5, 6, 15, 16, 30, 31, null].map(tierLabel)).toEqual([
      'Unrated',
      'Bronze V',
      'Bronze I',
      'Silver V',
      'Gold I',
      'Platinum V',
      'Ruby I',
      'Master',
      undefined,
    ]);
  });

  test('imports recent LeetCode submissions and shows the difficulty in the list', async () => {
    const api = server([
      {
        problem: {
          id: 2,
          site: 'leetcode',
          problemKey: 'two-sum',
          title: 'Two Sum',
          url: null,
          difficulty: 'Easy',
        },
        attempts: [],
      },
    ]);
    render(<CodingProblems today={today} />);
    expect(await screen.findByText('Easy')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Import recent LeetCode submissions' }));
    expect(
      await screen.findByText('Imported from LeetCode: 4 added, 0 already recorded'),
    ).toBeTruthy();
    expect(api.requests.some((r) => r.path === '/api/coding/leetcode/import')).toBe(true);
  });
});
