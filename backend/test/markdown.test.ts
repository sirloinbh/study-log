import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frontendMissing } from './ui-harness.js';

// Renders the real memo component with react-markdown and react-dom/server (#16), unlike the
// UI tests whose harness stands in for React. Skipped where the frontend is missing.
const uiTest = frontendMissing ? test.skip : test;

// Untyped on purpose: the backend typecheck must not need the frontend's packages.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = (name: string): Promise<any> => import(name);

async function render(text: string): Promise<string> {
  const [{ createElement }, { renderToStaticMarkup }, { Memo }] = await Promise.all([
    load('react'),
    load('react-dom/server'),
    load(new URL('../../frontend/src/Memo.tsx', import.meta.url).href),
  ]);
  return renderToStaticMarkup(createElement(Memo, { text }));
}

uiTest('a memo renders Markdown headings, lists, emphasis, code and links', async () => {
  const html = await render(
    '# 행렬\n\n- 곱셈\n- 전치\n\n**중요** `A^T` [강의](https://example.com/a?b=1)',
  );
  for (const part of [
    '<h1>행렬</h1>',
    '<li>곱셈</li>',
    '<strong>중요</strong>',
    '<code>A^T</code>',
    '<a href="https://example.com/a?b=1" target="_blank" rel="noopener noreferrer">강의</a>',
  ])
    assert.ok(html.includes(part), `${part} in ${html}`);
  assert.match(await render('짧은 메모'), /^<div class="memo"><p>짧은 메모<\/p><\/div>$/);
});

uiTest('HTML and script links in a memo are never rendered as markup', async () => {
  const attacks = [
    '<script>alert(1)</script>',
    '<img src=x onerror="alert(1)">',
    '<a href="javascript:alert(1)">클릭</a>',
    '<iframe src="https://example.com"></iframe>',
    '본문 <b onmouseover="alert(1)">굵게</b>',
  ];
  for (const attack of attacks) {
    const html = await render(attack);
    // The tags are shown as text, escaped, so the browser runs none of them.
    assert.doesNotMatch(html, /<(script|img|iframe|b)[\s>]|<a /i, html);
    assert.ok(html.includes('&lt;'), html);
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
    const html = await render(link);
    assert.doesNotMatch(html, /<(a|img)[\s>]|href=|src=/i, html);
  }
  assert.equal(
    await render('[클릭](javascript:alert(1)) ![그림](javascript:alert(1))'),
    '<div class="memo"><p>클릭 그림</p></div>',
  );
  // A safe image still shows.
  assert.match(
    await render('![그래프](https://example.com/g.png)'),
    /<img src="https:\/\/example.com\/g.png" alt="그래프"\/>/,
  );
});
