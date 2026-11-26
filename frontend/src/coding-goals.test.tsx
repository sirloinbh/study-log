import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, test } from 'vitest';

import { columnLabel, type GoalListRow, suggestedListName } from './coding';
import { CodingGoals, type Notice } from './coding-goals';
import { type Answer, fakeApi, type Sent } from './test/fake-api';
import { render } from './test/render';

const sheets = [
  {
    name: '학습가이드',
    headers: ['안내'],
    rowCount: 3,
    tooLong: false,
    preview: [],
    mapping: {},
  },
  {
    name: '문제목록',
    headers: ['순서', '문제 번호', '문제 제목', '완료'],
    rowCount: 500,
    tooLong: false,
    preview: [['1', '2557', 'Hello World', '']],
    mapping: { order: 0, key: 1, title: 2, status: 3 },
  },
];
const plan = {
  listExists: false,
  total: 498,
  willAdd: 498,
  willUpdate: 0,
  unchanged: 0,
  notInFile: 0,
  alreadyLogged: 12,
  attemptsToAdd: 7,
  skipped: [{ row: 9, reason: 'The problem number is not a Baekjoon number' }],
  blank: 1,
  sample: [
    { site: 'baekjoon', problemKey: '2557', title: 'Hello World', topic: '입출력', level: 1 },
  ],
};

function server(lists: GoalListRow[] = []) {
  const answer = ({ method, path }: Sent): Answer | undefined => {
    if (path === '/api/coding/goals' && method === 'GET') return { body: { lists } };
    if (path === '/api/coding/goals/inspect') return { body: { sheets } };
    if (path === '/api/coding/goals/import') return { status: 200, body: { id: 1, plan } };
    const one = path.match(/^\/api\/coding\/goals\/(\d+)$/);
    if (one && method === 'DELETE') {
      lists.splice(0, lists.length);
      return { status: 204 };
    }
    return undefined;
  };
  return fakeApi(answer);
}

// The Coding screen shows the messages in one place; this stands in for it.
function Screen() {
  const [notice, setNotice] = useState<Notice>();
  return (
    <>
      <p role="status">{notice?.kind === 'status' ? notice.text : ''}</p>
      {notice?.kind === 'alert' && <p role="alert">{notice.text}</p>}
      <CodingGoals notify={setNotice} onOpenProblem={() => undefined} />
    </>
  );
}

const xlsx = () =>
  new File([new Uint8Array([0x50, 0x4b, 3, 4])], 'baekjoon-500.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

async function attach() {
  const card = await screen.findByLabelText('Goal lists');
  fireEvent.change(within(card).getByLabelText('Excel file'), { target: { files: [xlsx()] } });
  await within(card).findByLabelText('Problem number');
  return card;
}

describe('goal list import', () => {
  test('reading a file picks the likely sheet, guesses the columns and names the list', async () => {
    const api = server();
    render(<Screen />);
    const card = await attach();
    expect(api.requests.find((r) => r.path === '/api/coding/goals/inspect')?.headers).toMatchObject(
      { 'x-requested-with': 'study-log' },
    );
    expect(within(card).getByLabelText<HTMLSelectElement>('Sheet').value).toBe('문제목록');
    expect(within(card).getByLabelText<HTMLSelectElement>('Problem number').value).toBe('1');
    expect(within(card).getByLabelText<HTMLSelectElement>('Title').value).toBe('2');
    expect(within(card).getByLabelText<HTMLSelectElement>('Link').value).toBe('');
    expect(within(card).getByLabelText<HTMLInputElement>('List name').value).toBe(
      'baekjoon-500 - 문제목록',
    );
    expect(within(card).getByRole('button', { name: 'Import' }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  test('the preview shows counts and skipped rows, then Import sends the same choices', async () => {
    const api = server();
    render(<Screen />);
    const card = await attach();
    fireEvent.change(within(card).getByLabelText('Target date for the whole list (optional)'), {
      target: { value: '2027-03-01' },
    });
    fireEvent.click(within(card).getByRole('button', { name: 'Preview the import' }));
    const preview = await within(card).findByLabelText('Import preview');
    expect(preview.textContent).toContain('Creates the list baekjoon-500 - 문제목록');
    expect(preview.textContent).toContain('498 problems (498 new, 0 changed, 0 unchanged)');
    expect(preview.textContent).toContain('12 already in your problem log');
    expect(preview.textContent).toContain('7 attempts will be added from the done marks');
    expect(
      within(preview).getByText('Row 9: The problem number is not a Baekjoon number'),
    ).toBeTruthy();

    fireEvent.click(within(card).getByRole('button', { name: 'Import' }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toMatch(
        /Imported baekjoon-500 - 문제목록: 498 added/,
      ),
    );
    const sent = api.requests.filter((r) => r.path === '/api/coding/goals/import');
    expect(sent).toHaveLength(2);
    expect(sent[0].form?.get('dryRun')).toBe('1');
    expect(sent[1].form?.get('dryRun')).toBeNull();
    expect(sent[1].form?.get('sheet')).toBe('문제목록');
    expect(sent[1].form?.get('site')).toBe('baekjoon');
    expect(sent[1].form?.get('targetDate')).toBe('2027-03-01');
    expect(JSON.parse(String(sent[1].form?.get('mapping')))).toEqual({
      order: 0,
      key: 1,
      title: 2,
      status: 3,
    });
    expect(within(card).queryByLabelText('Problem number')).toBeNull();
  });

  test('fixing a column clears the preview, and without a problem column nothing can be previewed', async () => {
    server();
    render(<Screen />);
    const card = await attach();
    fireEvent.click(within(card).getByRole('button', { name: 'Preview the import' }));
    await within(card).findByLabelText('Import preview');
    fireEvent.change(within(card).getByLabelText('Title'), { target: { value: '' } });
    expect(within(card).queryByLabelText('Import preview')).toBeNull();
    expect(within(card).getByRole('button', { name: 'Import' }).hasAttribute('disabled')).toBe(
      true,
    );
    fireEvent.change(within(card).getByLabelText('Problem number'), { target: { value: '' } });
    expect(
      within(card).getByText('Choose the column with the problem number or the link.'),
    ).toBeTruthy();
    expect(
      within(card).getByRole('button', { name: 'Preview the import' }).hasAttribute('disabled'),
    ).toBe(true);
  });

  test('a file over 2 MB is refused before it is sent, and a server refusal is shown', async () => {
    const api = server();
    render(<Screen />);
    const card = await screen.findByLabelText('Goal lists');
    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.xlsx');
    fireEvent.change(within(card).getByLabelText('Excel file'), { target: { files: [big] } });
    expect((await screen.findByRole('alert')).textContent).toBe('The file must be at most 2 MB');
    expect(api.requests.some((r) => r.path === '/api/coding/goals/inspect')).toBe(false);
  });

  test('lists the goal lists with counts, and deletes one after confirming', async () => {
    server([
      {
        id: 1,
        name: 'Baekjoon 500',
        targetDate: '2027-03-01',
        total: 500,
        solved: 40,
        late: 0,
        weekPlanned: 0,
        weekSolved: 0,
        alreadyLogged: 40,
        next: [],
      },
    ]);
    render(<Screen />);
    const list = await screen.findByLabelText('Your goal lists');
    expect(list.textContent).toContain('Baekjoon 500');
    expect(list.textContent).toContain('500 problems, 40 in your log, target 2027-03-01');
    fireEvent.click(within(list).getByRole('button', { name: 'Baekjoon 500 delete' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Deleted the goal list Baekjoon 500'),
    );
  });

  test('column and list name helpers', () => {
    expect(columnLabel(0, '순서')).toBe('A: 순서');
    expect(columnLabel(3, ' ')).toBe('D: (no header)');
    expect(suggestedListName('goals.xlsx', '문제목록', 1)).toBe('goals');
    expect(suggestedListName('goals.xlsx', '문제목록', 2)).toBe('goals - 문제목록');
    expect(suggestedListName('.xlsx', 'a', 1)).toBe('Goal list');
  });
});
