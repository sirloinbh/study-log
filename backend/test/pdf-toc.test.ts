import assert from 'node:assert/strict';
import { test } from 'node:test';

import { frontendMissing, loadFrontendModule } from './ui-harness.js';

type Outline = { title: string; items: Outline[] };
type Piece = { str: string; transform: number[]; height?: number; width?: number };
type PdfToc = {
  outlineText(items: Outline[]): string[];
  pageText(pieces: Piece[]): string[];
};
type Toc = { parseToc(text: string): { level: number; number: string; title: string }[] };

const uiTest = frontendMissing ? test.skip : test;
// The modules run in their own realm; their arrays become this realm's for deepEqual.
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const pdf = () => loadFrontendModule<PdfToc>('pdf-toc.ts');
const outline = (text: string) =>
  plain(loadFrontendModule<Toc>('toc.ts').parseToc(text)).map(
    (e) => `${e.level} ${e.number}|${e.title}`,
  );

// A piece at (x, y) with a 10pt font and the given width.
const at = (str: string, x: number, y: number, width = str.length * 5): Piece => ({
  str,
  transform: [10, 0, 0, 10, x, y],
  height: 10,
  width,
});

uiTest('PDF bookmarks become indented lines the parser nests (#23)', () => {
  const lines = plain(
    pdf().outlineText([
      {
        title: ' 1  Vectors ',
        items: [
          { title: '1.1 Addition', items: [] },
          { title: 'Exercises', items: [{ title: '', items: [] }] },
        ],
      },
      { title: 'Index', items: [] },
    ]),
  );
  assert.deepEqual(lines, ['1 Vectors', '  1.1 Addition', '  Exercises', 'Index']);
  assert.deepEqual(outline(lines.join('\n')), [
    '0 1|Vectors',
    '1 1.1|Addition',
    '1 |Exercises',
    '0 |Index',
  ]);
});

uiTest('page text is rebuilt into lines with indentation and page-number gaps', () => {
  const lines = plain(
    pdf().pageText([
      // Out of order on purpose: PDF text comes in drawing order.
      at('120', 400, 700),
      at('1.1 가우스 소거법', 70, 680),
      at('Chapter 1 연립방정식', 50, 700),
      at('3', 400, 680),
      at('', 0, 600),
      at('1.2', 70, 660, 15),
      at('행렬', 88, 660),
    ]),
  );
  assert.deepEqual(lines, [
    'Chapter 1 연립방정식  120',
    '    1.1 가우스 소거법  3',
    '    1.2 행렬',
  ]);
  // The parser then drops the page numbers and nests by the numbers.
  assert.deepEqual(outline(lines.join('\n')), [
    '0 Chapter 1|연립방정식',
    '1 1.1|가우스 소거법',
    '1 1.2|행렬',
  ]);
  assert.deepEqual(plain(pdf().pageText([])), []);
});
