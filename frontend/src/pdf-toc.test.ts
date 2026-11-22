import { expect, test } from 'vitest';

import { outlineText, pageText, type TextPiece } from './pdf-toc';
import { parseToc } from './toc';

const outline = (text: string) => parseToc(text).map((e) => `${e.level} ${e.number}|${e.title}`);

type Piece = TextPiece & { width?: number };

// A piece at (x, y) with a 10pt font and the given width.
const at = (str: string, x: number, y: number, width = str.length * 5): Piece => ({
  str,
  transform: [10, 0, 0, 10, x, y],
  height: 10,
  width,
});

test('PDF bookmarks become indented lines the parser nests (#23)', () => {
  const lines = outlineText([
    {
      title: ' 1  Vectors ',
      items: [
        { title: '1.1 Addition', items: [] },
        { title: 'Exercises', items: [{ title: '', items: [] }] },
      ],
    },
    { title: 'Index', items: [] },
  ]);
  expect(lines).toEqual(['1 Vectors', '  1.1 Addition', '  Exercises', 'Index']);
  expect(outline(lines.join('\n'))).toEqual([
    '0 1|Vectors',
    '1 1.1|Addition',
    '1 |Exercises',
    '0 |Index',
  ]);
});

test('page text is rebuilt into lines with indentation and page-number gaps', () => {
  const lines = pageText([
    // Out of order on purpose: PDF text comes in drawing order.
    at('120', 400, 700),
    at('1.1 가우스 소거법', 70, 680),
    at('Chapter 1 연립방정식', 50, 700),
    at('3', 400, 680),
    at('', 0, 600),
    at('1.2', 70, 660, 15),
    at('행렬', 88, 660),
  ]);
  expect(lines).toEqual(['Chapter 1 연립방정식  120', '    1.1 가우스 소거법  3', '    1.2 행렬']);
  // The parser then drops the page numbers and nests by the numbers.
  expect(outline(lines.join('\n'))).toEqual([
    '0 Chapter 1|연립방정식',
    '1 1.1|가우스 소거법',
    '1 1.2|행렬',
  ]);
  expect(pageText([])).toEqual([]);
});
