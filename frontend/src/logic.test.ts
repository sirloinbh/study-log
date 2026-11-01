import { describe, expect, test } from 'vitest';

import { calendarCells, monthTitle, shiftMonth, shortMinutes } from './month-calendar';
import { outlineText, pageText } from './pdf-toc';
import {
  barWidth,
  busiestBar,
  chartBars,
  heatLevel,
  heatWeeks,
  hourLabel,
  monthLabel,
  type StudyTimeStats,
} from './study-stats';
import { parseToc, tocLimits, tocProblems, tocTree } from './toc';

describe('month-calendar', () => {
  test('months move across the ends of the year', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-10', 0)).toBe('2026-10');
    expect(monthTitle('2026-03')).toBe('2026년 3월');
  });

  test('the month starts on its weekday with Sunday first', () => {
    const day = (date: string) => ({ date, minutes: 0, logs: 0 });
    // 2026-11-01 is a Sunday, 2026-10-01 a Thursday. Neither depends on the machine's time zone.
    expect(calendarCells([day('2026-11-01')])).toEqual([day('2026-11-01')]);
    const october = calendarCells([day('2026-10-01')]);
    expect(october.slice(0, 4)).toEqual([null, null, null, null]);
    expect(october[4]).toEqual(day('2026-10-01'));
    expect(calendarCells([])).toEqual([]);
  });

  test('a day cell shows a short amount, nothing without study', () => {
    expect(shortMinutes(0)).toBe('');
    expect(shortMinutes(-5)).toBe('');
    expect(shortMinutes(45)).toBe('45분');
    expect(shortMinutes(60)).toBe('1시간');
    expect(shortMinutes(90)).toBe('1.5시간');
  });
});

describe('toc', () => {
  test('numbers decide the depth, and page numbers and the heading drop out', () => {
    const entries = parseToc('목차\n1 벡터 ...... 12\n1.1 내적\t15\n1.2 외적  18\n2 행렬\n');
    expect(entries.map(({ level, number, title }) => [level, number, title])).toEqual([
      [0, '1', '벡터'],
      [1, '1.1', '내적'],
      [1, '1.2', '외적'],
      [0, '2', '행렬'],
    ]);
    expect(entries[0].line).toBe(2);
  });

  test('a line without a number follows its indentation', () => {
    const entries = parseToc('머리말\nChapter 1 벡터\n  연습문제\n부록 A 표');
    expect(entries.map(({ level, title }) => [level, title])).toEqual([
      [0, '머리말'],
      [0, '벡터'],
      [1, '연습문제'],
      [0, '표'],
    ]);
  });

  test('an article is not a number, and "Chapter 1" alone is its own title', () => {
    expect(parseToc('A Tour of C++')[0]).toMatchObject({ number: '', title: 'A Tour of C++' });
    expect(parseToc('Chapter 1')[0]).toMatchObject({ number: '', title: 'Chapter 1' });
  });

  test('problems name the line, and the entries become a tree', () => {
    const long = 'x'.repeat(tocLimits.title + 1);
    expect(tocProblems(parseToc('1 벡터'))).toEqual([]);
    expect(tocProblems(parseToc(`1 벡터\n2 ${long}`))).toEqual([
      `2번째 줄: 제목이 ${tocLimits.title}자를 넘습니다`,
    ]);
    const many = Array.from({ length: tocLimits.entries + 1 }, (_, i) => `${i + 1} 장`).join('\n');
    expect(tocProblems(parseToc(many))[0]).toBe(
      `목차는 한 번에 ${tocLimits.entries}개까지 등록할 수 있습니다`,
    );
    const [first, second] = tocTree(parseToc('1 벡터\n1.1 내적\n2 행렬'));
    expect(first.children.map((node) => node.title)).toEqual(['내적']);
    expect(second.children).toEqual([]);
  });
});

describe('pdf-toc', () => {
  test('bookmarks become indented lines, without blank titles', () => {
    expect(
      outlineText([
        {
          title: ' 1  벡터 ',
          items: [
            { title: '1.1 내적', items: [] },
            { title: ' ', items: [{ title: '깊은 항목', items: [] }] },
          ],
        },
      ]),
    ).toEqual(['1 벡터', '  1.1 내적', '    깊은 항목']);
  });

  const piece = (str: string, x: number, y: number) => ({
    str,
    transform: [10, 0, 0, 10, x, y],
    height: 10,
    width: str.length * 5,
  });

  test('page pieces come back as lines from the top, with indentation and a page-number gap', () => {
    expect(
      pageText([
        piece('내적', 60, 680),
        piece('1 벡터', 50, 700),
        piece('12', 400, 700),
        piece(' ', 70, 660),
      ]),
    ).toEqual(['1 벡터  12', '  내적']);
    expect(pageText([])).toEqual([]);
  });
});

describe('study-stats', () => {
  test('heat levels keep fixed bands', () => {
    expect([0, 1, 29, 30, 59, 60, 119, 120].map(heatLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
  });

  test('days become week columns of seven, the rest of this week empty', () => {
    const daily = Array.from({ length: 9 }, (_, i) => ({
      date: `2026-09-${String(20 + i)}`,
      minutes: 0,
    }));
    const weeks = heatWeeks(daily);
    expect(weeks.map((week) => week.length)).toEqual([7, 7]);
    expect(weeks[1].slice(2)).toEqual([null, null, null, null, null]);
    expect(monthLabel([{ date: '2026-10-01', minutes: 0 }, null])).toBe('10월');
    expect(monthLabel([{ date: '2026-10-02', minutes: 0 }, null])).toBe('');
  });

  const stats = {
    daily: [
      { date: '2026-10-19', minutes: 0 },
      { date: '2026-10-20', minutes: 90 },
    ],
    weekly: [{ weekStart: '2026-10-18', minutes: 90 }],
    monthly: [{ month: '2026-10', minutes: 90 }],
  } as StudyTimeStats;

  test('chart bars are labelled for their unit', () => {
    expect(chartBars(stats, 'day').map((bar) => [bar.label, bar.hours])).toEqual([
      ['10/19', 0],
      ['10/20', 1.5],
    ]);
    expect(chartBars(stats, 'week')[0].label).toBe('10/18~');
    expect(chartBars(stats, 'month')[0].label).toBe('26.10');
  });

  test('the busiest bar is the earliest on a tie, none without study', () => {
    const [empty, full] = chartBars(stats, 'day');
    expect(busiestBar([empty, full, { ...full, key: 'later' }])).toBe(full);
    expect(busiestBar([empty])).toBeUndefined();
  });

  test('small labels and bar widths', () => {
    expect(hourLabel(23)).toBe('23시~0시');
    expect(barWidth(30, [30, 60])).toBe('50%');
    expect(barWidth(0, [0, 0])).toBe('0%');
  });
});
