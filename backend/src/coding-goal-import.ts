import { type CodingSite } from './coding-problems.js';

// Turning the cells of one sheet into goal items (#425). Pure: the workbook reader and the
// database are elsewhere, so the rules here are tested on plain arrays.

// The columns an item can take from the sheet, by the number of the column (0 is the first).
export const goalFields = [
  'order',
  'group',
  'topic',
  'key',
  'title',
  'level',
  'url',
  'targetDate',
  // The user's own progress in the sheet (#425, user decision 2026-11-26): O / △ / X, the day it
  // was solved and a note. They become attempts on the first import only.
  'status',
  'solvedDate',
  'note',
] as const;
export type GoalField = (typeof goalFields)[number];
export type Mapping = Partial<Record<GoalField, number>>;

// What a file may hold: the limits of the card (#425).
export const maxSheetRows = 2000;
export const maxFileBytes = 2 * 1024 * 1024;

export type GoalAttempt = { result: 'solved' | 'partial'; date: string; notes: string };
export type GoalItem = {
  site: CodingSite;
  problemKey: string;
  title: string;
  group: string;
  topic: string;
  level: number | null;
  targetDate: string | null;
  position: number;
  // From the progress columns: only a row marked O or △ with a solve date has one.
  attempt: GoalAttempt | null;
};
export type Skipped = { row: number; reason: string };

// Header names the sample file and its English twins use, compared without spaces or case.
const synonyms: Record<GoalField, string[]> = {
  key: ['문제번호', 'problemnumber', 'problemid', 'problemkey', 'key', 'id', '번호id'],
  title: ['문제제목', '제목', '문제명', '문제이름', 'title', 'name', 'problemtitle'],
  order: ['순서', '번호', 'order', 'no', '#', 'seq'],
  group: ['단계', '주차', 'stage', 'week', 'group', 'step'],
  topic: ['분야', '주제', '유형', 'topic', 'category', 'tag', 'tags'],
  level: ['난이도', '티어', 'difficulty', 'tier', 'level'],
  url: ['링크', '주소', 'url', 'link'],
  status: ['완료', '상태', 'status', 'done', 'result', '결과'],
  solvedDate: ['풀이날짜', '풀이일', '푼날짜', 'solveddate', 'donedate', 'solvedon'],
  note: ['메모', '비고', 'note', 'notes', 'memo'],
  targetDate: ['목표일', '목표날짜', '마감일', '마감', 'targetdate', 'duedate', 'deadline'],
};
const normal = (text: string) => text.toLowerCase().replace(/\s+/g, '');

// Guesses which column holds what from the header row; each column is used once, and the fields
// that matter most choose first. The user fixes a wrong guess in the mapping step.
export function guessMapping(headers: readonly string[]): Mapping {
  const names = headers.map(normal);
  const mapping: Mapping = {};
  const taken = new Set<number>();
  for (const field of [
    'key',
    'title',
    'url',
    'level',
    'topic',
    'group',
    'targetDate',
    'status',
    'solvedDate',
    'note',
    'order',
  ] as const) {
    const index = names.findIndex((name, i) => !taken.has(i) && synonyms[field].includes(name));
    if (index >= 0) {
      mapping[field] = index;
      taken.add(index);
    }
  }
  return mapping;
}

const tierNames: Record<string, number> = {
  브론즈: 0,
  bronze: 0,
  실버: 1,
  silver: 1,
  골드: 2,
  gold: 2,
  플래티넘: 3,
  플래티너: 3,
  platinum: 3,
  다이아몬드: 4,
  다이아: 4,
  diamond: 4,
  루비: 5,
  ruby: 5,
};
const romans: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 };

// "브론즈 5" and "Bronze V" are level 1, "골드 3" is 13, "Ruby I" is 30; text that names no tier
// (or "Unrated") gives null.
export function parseLevel(text: string): number | null {
  const match = text.trim().match(/^(.*?)\s*([1-5]|[iIvV]{1,3})$/);
  if (!match) return null;
  const tier = tierNames[match[1].trim().toLowerCase()];
  const rank = /^\d$/.test(match[2]) ? Number(match[2]) : romans[match[2].toLowerCase()];
  if (tier === undefined || rank === undefined || rank < 1 || rank > 5) return null;
  return tier * 5 + (6 - rank);
}

// A problem link of a site the app knows.
export function problemFromUrl(text: string): { site: CodingSite; problemKey: string } | undefined {
  const baekjoon = text.match(/^https?:\/\/(?:www\.)?acmicpc\.net\/problem\/([1-9]\d{0,6})\/?$/i);
  if (baekjoon) return { site: 'baekjoon', problemKey: baekjoon[1] };
  const leetcode = text.match(
    /^https?:\/\/(?:www\.)?leetcode\.(?:com|cn)\/problems\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/.*)?$/i,
  );
  if (leetcode) return { site: 'leetcode', problemKey: leetcode[1].toLowerCase() };
  return undefined;
}

const siteName: Record<CodingSite, string> = {
  baekjoon: 'Baekjoon',
  leetcode: 'LeetCode',
  other: 'Other',
};

// A real calendar date written as 2026-12-01, 2026/12/01 or 2026.12.01.
export function parseDay(text: string): string | undefined {
  const match = text.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!match) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return undefined;
  return `${match[1]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// O (or a check mark) is solved on its own, △ is solved after reading a solution; X and an empty
// cell are neither.
export function parseStatus(text: string): 'solved' | 'partial' | undefined {
  const value = text.trim().toLowerCase();
  if (['o', '○', '◯', '⭕', '✓', '✔', '완료', 'done', 'solved'].includes(value)) return 'solved';
  if (['△', '▲', '삼각', 'partial'].includes(value)) return 'partial';
  return undefined;
}

const cleaned = (text: string | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

function keyOf(site: CodingSite, raw: string): { key?: string; issue?: string } {
  const text = raw.trim();
  if (site === 'baekjoon') {
    // A number cell can arrive as 2557.0.
    const whole = text.replace(/\.0+$/, '');
    return /^[1-9]\d{0,6}$/.test(whole)
      ? { key: whole }
      : { issue: 'The problem number is not a Baekjoon number' };
  }
  if (site === 'leetcode') {
    const slug = text.toLowerCase();
    return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)
      ? { key: slug }
      : { issue: 'The problem is not a LeetCode title slug, like two-sum' };
  }
  return text.length >= 1 && text.length <= 100
    ? { key: text }
    : { issue: 'The problem ID must be 1 to 100 characters' };
}

// Reads the data rows (every row after the first) into items. A row that cannot become an item is
// listed with the reason and its sheet row number (the header is row 1); blank rows are ignored
// and a problem that repeats keeps its first row.
export function mapRows(
  grid: readonly (readonly string[])[],
  mapping: Mapping,
  defaultSite: CodingSite,
): { items: GoalItem[]; skipped: Skipped[]; blank: number } {
  const items: GoalItem[] = [];
  const skipped: Skipped[] = [];
  const seen = new Map<string, number>();
  let blank = 0;
  const cell = (row: readonly string[], field: GoalField) =>
    mapping[field] === undefined ? '' : (row[mapping[field]] ?? '').toString();
  grid.slice(1).forEach((row, index) => {
    const number = index + 2;
    if (row.every((value) => !value.toString().trim())) {
      blank += 1;
      return;
    }
    const skip = (reason: string) => void skipped.push({ row: number, reason });
    const url = cell(row, 'url').trim();
    const linked = url ? problemFromUrl(url) : undefined;
    const site = linked?.site ?? defaultSite;
    const rawKey = cell(row, 'key').trim();
    let key = linked?.problemKey;
    if (rawKey) {
      const read = keyOf(site, rawKey);
      if (read.issue) return skip(read.issue);
      key = read.key;
    } else if (!linked) {
      return skip(
        url ? 'The link is not a Baekjoon or LeetCode problem' : 'No problem number or link',
      );
    }
    if (!key) return skip('No problem number or link');
    const target = cell(row, 'targetDate').trim();
    const targetDate = target ? parseDay(target) : undefined;
    if (target && !targetDate) return skip('The target date is not a date like 2026-12-01');
    const title = cleaned(cell(row, 'title')).slice(0, 200) || `${siteName[site]} ${key}`;
    const identity = `${site}:${key}`;
    const first = seen.get(identity);
    if (first !== undefined) return skip(`The same problem as row ${first}`);
    seen.set(identity, number);
    const result = parseStatus(cell(row, 'status'));
    const solved = parseDay(cell(row, 'solvedDate'));
    const note = cell(row, 'note').trim().slice(0, 5000);
    const order = Number(cell(row, 'order').trim());
    items.push({
      site,
      problemKey: key,
      title,
      group: cleaned(cell(row, 'group')).slice(0, 100),
      topic: cleaned(cell(row, 'topic')).slice(0, 100),
      level: parseLevel(cell(row, 'level')),
      targetDate: targetDate ?? null,
      attempt: result && solved ? { result, date: solved, notes: note } : null,
      position:
        Number.isInteger(order) && order >= 0 && order < 1_000_000 ? order : items.length + 1,
    });
  });
  return { items, skipped, blank };
}
