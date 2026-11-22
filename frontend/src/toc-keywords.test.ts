import { describe, expect, it } from 'vitest';

import { pageText } from './pdf-toc';
import { contentOptions } from './textbook';
import { parseToc } from './toc';

describe('toc keywords (#283)', () => {
  it('does not read ordinary words as numbers', () => {
    for (const line of ['Chapters 1-3 Review', 'Units of measure', 'Lessons learned']) {
      const [entry] = parseToc(line);
      expect(entry.number).toBe('');
      expect(entry.title).toBe(line);
    }
  });
  it('still reads numbers, letters and roman numerals', () => {
    expect(parseToc('Chapter 3 Vectors')[0]).toMatchObject({
      number: 'Chapter 3',
      title: 'Vectors',
    });
    expect(parseToc('Appendix A Tables')[0]).toMatchObject({ number: 'Appendix A' });
    expect(parseToc('Chapter IV Limits')[0]).toMatchObject({ number: 'Chapter IV' });
    expect(parseToc('Chapter Civil')[0].number).toBe('');
  });
  it('splits a two-column page into separate entries', () => {
    const piece = (str: string, x: number, y: number) => ({
      str,
      transform: [10, 0, 0, 10, x, y],
      height: 10,
      width: str.length * 5,
    });
    const lines = pageText([
      piece('1 Vectors', 50, 700),
      piece('5 Graphs', 350, 700),
      piece('2 Matrices', 50, 680),
      piece('6 Trees', 350, 680),
    ]);
    expect(lines.map((l) => l.trim())).toEqual(['1 Vectors', '2 Matrices', '5 Graphs', '6 Trees']);
  });
  it('indents options with non-breaking spaces', () => {
    const [a, b] = contentOptions([
      {
        id: 1,
        number: '1',
        title: 'A',
        children: [{ id: 2, number: '1.1', title: 'B', children: [] }],
      },
    ]);
    expect(a.label).toBe('1 A');
    expect(b.label.startsWith('  ')).toBe(true);
  });
});
