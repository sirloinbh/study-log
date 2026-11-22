import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';

import { Memo } from './memo';

const render = (text: string) => renderToStaticMarkup(<Memo text={text} />);

test('a memo renders Markdown headings, lists, emphasis, code and links', () => {
  const html = render(
    '# 행렬\n\n- 곱셈\n- 전치\n\n**중요** `A^T` [강의](https://example.com/a?b=1)',
  );
  for (const part of [
    '<h1>행렬</h1>',
    '<li>곱셈</li>',
    '<strong>중요</strong>',
    '<code>A^T</code>',
    '<a href="https://example.com/a?b=1" target="_blank" rel="noopener noreferrer">강의</a>',
  ])
    expect(html, part).toContain(part);
  // A single Enter stays a line break inside the paragraph; the stylesheet shows it (pre-line).
  expect(render('1줄\n2줄')).toBe('<div class="memo"><p>1줄\n2줄</p></div>');
  // A hard break (two spaces or a backslash) is one <br>, not <br> and a second newline.
  for (const hard of ['1줄  \n2줄', '1줄\\\n2줄'])
    expect(render(hard), hard).toBe('<div class="memo"><p>1줄<br/>2줄</p></div>');
  expect(render('짧은 메모')).toMatch(/^<div class="memo"><p>짧은 메모<\/p><\/div>$/);
});

test('HTML and script links in a memo are never rendered as markup', () => {
  const attacks = [
    '<script>alert(1)</script>',
    '<img src=x onerror="alert(1)">',
    '<a href="javascript:alert(1)">클릭</a>',
    '<iframe src="https://example.com"></iframe>',
    '본문 <b onmouseover="alert(1)">굵게</b>',
  ];
  for (const attack of attacks) {
    const html = render(attack);
    // The tags are shown as text, escaped, so the browser runs none of them.
    expect(html).not.toMatch(/<(script|img|iframe|b)[\s>]|<a /i);
    expect(html).toContain('&lt;');
  }
  for (const link of [
    '[클릭](javascript:alert(1))',
    '[클릭](JaVaScRiPt:alert(1))',
    '[클릭](vbscript:msgbox(1))',
    '[클릭](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
    '![그림](javascript:alert(1))',
    '<javascript:alert(1)>',
  ]) {
    // The URL check empties the address; the memo then keeps only the link's text.
    const html = render(link);
    expect(html).not.toMatch(/<(a|img)[\s>]|href=|src=/i);
  }
  expect(render('[클릭](javascript:alert(1)) ![그림](javascript:alert(1))')).toBe(
    '<div class="memo"><p>클릭 그림</p></div>',
  );
  // A safe image still shows.
  expect(render('![그래프](https://example.com/g.png)')).toMatch(
    /<img src="https:\/\/example.com\/g.png" alt="그래프"\/>/,
  );
});
