import assert from 'node:assert/strict';
import { test } from 'node:test';

import { frontendMissing, loadFrontendModule } from './ui-harness.js';

type Entry = { line: number; level: number; number: string; title: string };
type Toc = {
  parseToc(text: string): Entry[];
  tocProblems(entries: Entry[]): string[];
  tocTree(entries: Entry[]): (Entry & { children: unknown[] })[];
};

const uiTest = frontendMissing ? test.skip : test;
const loaded = () => loadFrontendModule<Toc>('toc.ts');
// The module runs in its own realm; its arrays become this realm's for deepEqual.
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const toc = (): Toc => {
  const module = loaded();
  return {
    parseToc: (text) => plain(module.parseToc(text)),
    tocProblems: (entries) => plain(module.tocProblems(entries)),
    tocTree: (entries) => plain(module.tocTree(entries)),
  };
};
// Each entry as "level number|title", easy to compare.
const outline = (text: string) =>
  toc()
    .parseToc(text)
    .map((e) => `${e.level} ${e.number}|${e.title}`);

uiTest('decimal numbers nest by their parts, with page numbers dropped (#23)', () => {
  assert.deepEqual(
    outline(
      [
        '1. 벡터 ........ 1',
        '1.1 벡터의 덧셈\t3',
        '1.1.1 교환법칙   5',
        '1.2 내적',
        '2 행렬 ··· 20',
      ].join('\n'),
    ),
    ['0 1|벡터', '1 1.1|벡터의 덧셈', '2 1.1.1|교환법칙', '1 1.2|내적', '0 2|행렬'],
  );
  // Hyphenated numbers and a letter-led appendix number work the same way.
  assert.deepEqual(outline('1-1 극한\n1-1-1 좌극한\nA.1 공식'), [
    '0 1-1|극한',
    '1 1-1-1|좌극한',
    '0 A.1|공식',
  ]);
});

uiTest('parts hold chapters and chapters hold sections and decimal numbers', () => {
  assert.deepEqual(
    outline(
      [
        'Part I Foundations',
        'Chapter 1: Vectors',
        '1.1 Addition',
        'Chapter 2 - Matrices',
        'Part II',
        'Appendix A Proofs',
      ].join('\n'),
    ),
    [
      '0 Part I|Foundations',
      '1 Chapter 1|Vectors',
      '2 1.1|Addition',
      '1 Chapter 2|Matrices',
      // A number without a title keeps the number as its title.
      '0 |Part II',
      '1 Appendix A|Proofs',
    ],
  );
  assert.deepEqual(outline('제1부 기초\n제1장 집합\n제1절 원소\n2장 함수\n부록 연습문제 해답'), [
    '0 제1부|기초',
    '1 제1장|집합',
    '2 제1절|원소',
    '1 2장|함수',
    '1 부록|연습문제 해답',
  ]);
});

uiTest('lines without numbers follow their indentation', () => {
  assert.deepEqual(outline('미분\n  도함수\n    연쇄 법칙\n  극값\n적분\n\t정적분'), [
    '0 |미분',
    '1 |도함수',
    '2 |연쇄 법칙',
    '1 |극값',
    '0 |적분',
    '1 |정적분',
  ]);
  // Korean text often indents with the full-width space.
  const wide = String.fromCharCode(0x3000);
  assert.deepEqual(outline(`미분\n${wide}도함수`), ['0 |미분', '1 |도함수']);
  // Mixed: an unnumbered, indented line goes under the numbered line above it.
  assert.deepEqual(outline('1 벡터\n   연습문제\n2 행렬'), ['0 1|벡터', '1 |연습문제', '0 2|행렬']);
  // A preface before the first chapter sits beside the chapters, not above them; an unnumbered
  // line after a section, at the same indentation, stays at the section's level.
  assert.deepEqual(outline('머리말\n제1장 집합\n1.1 원소\n맺음말'), [
    '0 |머리말',
    '0 제1장|집합',
    '1 1.1|원소',
    '1 |맺음말',
  ]);
});

uiTest('headings, blank lines, bare page numbers and look-alike titles', () => {
  const entries = toc().parseToc(
    '목차\n\n  \n1 벡터\n12\nA Tour of C++\n3D 그래픽\n2024년 개정판 안내',
  );
  assert.deepEqual(
    entries.map((e) => [e.line, e.level, e.number, e.title]),
    [
      [4, 0, '1', '벡터'],
      // Not numbers: an article, a word that starts with a digit, a year.
      [6, 0, '', 'A Tour of C++'],
      [7, 0, '', '3D 그래픽'],
      [8, 0, '', '2024년 개정판 안내'],
    ],
  );
  // A title that merely ends in a number keeps it when it is one space away.
  assert.deepEqual(outline('연습 3\n부록 2'), ['0 |연습 3', '0 |부록 2']);
  // A number longer than the API allows stays in the title.
  assert.deepEqual(outline('1.2.3.4.5.6.7.8.9.10.11 너무 깊음'), [
    '0 |1.2.3.4.5.6.7.8.9.10.11 너무 깊음',
  ]);
});

uiTest('problems that block saving, and the preview tree', () => {
  const { parseToc, tocProblems, tocTree } = toc();
  assert.deepEqual(tocProblems(parseToc('1 벡터\n1.1 내적')), []);
  assert.deepEqual(tocProblems(parseToc(`1 벡터\n2 ${'가'.repeat(201)}`)), [
    '2번째 줄: 제목이 200자를 넘습니다',
  ]);
  const deep = Array.from({ length: 11 }, (_, i) => ' '.repeat(i * 2) + `단계 ${i + 1}`).join('\n');
  assert.deepEqual(tocProblems(parseToc(deep)), ['11번째 줄: 목차는 10단계까지입니다']);
  const many = Array.from({ length: 501 }, (_, i) => `${i + 1} 항목`).join('\n');
  assert.deepEqual(tocProblems(parseToc(many)), ['목차는 한 번에 500개까지 등록할 수 있습니다']);

  const tree = tocTree(parseToc('1 벡터\n1.1 내적\n1.2 외적\n2 행렬'));
  assert.deepEqual(
    tree.map((n) => [n.title, (n.children as Entry[]).map((c) => c.title)]),
    [
      ['벡터', ['내적', '외적']],
      ['행렬', []],
    ],
  );
});
