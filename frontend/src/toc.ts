// Turning a pasted table of contents into entries (#23). Each non-blank line is one entry; its
// number decides how deep it goes, and a line without a number follows its indentation.

export type TocEntry = { line: number; level: number; number: string; title: string };
export type TocTree = TocEntry & { children: TocTree[] };

// Same limits as the API.
export const tocLimits = { text: 50000, entries: 500, levels: 10, number: 20, title: 200 } as const;

// How deep each kind of number goes: parts hold chapters, chapters hold sections. A decimal
// number goes one step deeper per part, so "1.2" sits under "1" or under "Chapter 1".
const roman = '[IVXLCDM]+';
const end = '(?=[\\s.:)\\-–—]|$)';
const kinds: { rank: number; pattern: RegExp }[] = [
  {
    rank: 0,
    pattern: new RegExp(`^(?:(?:part|book)\\s*(?:\\d+|${roman})|제\\s*\\d+\\s*[부편])${end}`, 'i'),
  },
  {
    rank: 1,
    pattern: new RegExp(
      `^(?:(?:chapter|ch\\.|appendix|unit|lesson)\\s*(?:\\d+|[A-Z])|제\\s*\\d+\\s*장|\\d+\\s*장|부록\\s*(?:\\d+|[A-Z])?)${end}`,
      'i',
    ),
  },
  { rank: 2, pattern: new RegExp(`^(?:제\\s*\\d+\\s*절|\\d+\\s*절)${end}`) },
];
// "1", "1.", "1.2", "1-2-3", "A.1": a letter needs at least one more part, so the article in
// "A Tour of C++" is not read as a number.
const decimal = /^(?:\d+(?:[.-]\d+)*|[A-Z](?:\.\d+)+)(?=\.?(?:\s|$))/;
// A page number after dot leaders, a tab or a wide gap: "벡터 ...... 12", "벡터\t12".
const pageNumber = /(?:\s*[.·…_]{2,}\s*|\t+|\s{2,})\d{1,4}\s*$/;
const heading = /^(?:목차|차례|contents|table of contents)$/i;

const indentOf = (raw: string) =>
  // Any whitespace but a line break: spaces, tabs and the full-width space of Korean text.
  (raw.match(/^[^\S\r\n]*/)?.[0] ?? '').split('').reduce((n, c) => n + (c === '\t' ? 4 : 1), 0);

function split(text: string): { rank?: number; number: string; title: string } {
  for (const { rank, pattern } of kinds) {
    const found = text.match(pattern);
    if (found) return { rank, number: found[0].trim(), title: text.slice(found[0].length) };
  }
  const found = text.match(decimal);
  if (found)
    return {
      rank: found[0].split(/[.-]/).length,
      number: found[0],
      title: text.slice(found[0].length),
    };
  return { number: '', title: text };
}

export function parseToc(text: string): TocEntry[] {
  const lines = text.split(/\r?\n/).map((raw, index) => {
    const line = raw.replace(pageNumber, '').trim();
    return { index, indent: indentOf(raw), line, parts: split(line) };
  });
  // An unnumbered line with nothing above it to follow (a preface) sits beside the shallowest
  // numbered entries, so the chapters after it do not end up inside it.
  const ranks = lines.flatMap(({ parts }) => (parts.rank === undefined ? [] : [parts.rank]));
  const top = ranks.length ? Math.min(...ranks) : 0;
  const entries: TocEntry[] = [];
  // Open entries from the top level down, each with the rank and indentation that opened it.
  const open: { rank: number; indent: number }[] = [];
  const seen: { rank: number; indent: number }[] = [];
  lines.forEach(({ index, indent, line, parts }) => {
    if (!line || /^\d+$/.test(line) || (entries.length === 0 && heading.test(line))) return;
    let { number } = parts;
    let title = parts.title.replace(/^[\s.:)\-–—]+/, '').trim();
    // A number too long to keep apart stays in the title.
    if (number.length > tocLimits.number) [number, title] = ['', line];
    // "Chapter 1" alone: the number is the title.
    if (!title) [number, title] = ['', number];
    let rank = parts.rank;
    if (rank === undefined) {
      // No number: one deeper than an entry it is indented under, otherwise level with the last
      // entry at most as indented, or at the top.
      const last = seen.at(-1);
      if (last && indent > last.indent) rank = last.rank + 1;
      else rank = [...seen].reverse().find((s) => s.indent <= indent)?.rank ?? top;
    }
    seen.push({ rank, indent });
    while (open.length && open[open.length - 1].rank >= rank) open.pop();
    open.push({ rank, indent });
    entries.push({ line: index + 1, level: open.length - 1, number, title });
  });
  return entries;
}

// Why the entries cannot be saved as they are, line by line; empty when they can.
export function tocProblems(entries: TocEntry[]): string[] {
  const problems: string[] = [];
  if (entries.length > tocLimits.entries)
    problems.push(`목차는 한 번에 ${tocLimits.entries}개까지 등록할 수 있습니다`);
  for (const entry of entries) {
    if (entry.title.length > tocLimits.title)
      problems.push(`${entry.line}번째 줄: 제목이 ${tocLimits.title}자를 넘습니다`);
    if (entry.level >= tocLimits.levels)
      problems.push(`${entry.line}번째 줄: 목차는 ${tocLimits.levels}단계까지입니다`);
  }
  return problems;
}

// The entries as a tree for the preview.
export function tocTree(entries: TocEntry[]): TocTree[] {
  const roots: TocTree[] = [];
  const path: TocTree[] = [];
  for (const entry of entries) {
    const node = { ...entry, children: [] };
    path.length = entry.level;
    (path.at(-1)?.children ?? roots).push(node);
    path.push(node);
  }
  return roots;
}
