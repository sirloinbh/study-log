import React, { useEffect, useRef } from 'react';
import Markdown from 'react-markdown';

type HastNode = { type: string; tagName?: string; value?: string; children?: HastNode[] };

// A hard break (two spaces or a backslash before Enter) becomes <br> and a newline. Memo
// paragraphs keep newlines (white-space: pre-line), so that newline goes, or it breaks twice.
const singleBreaks = () => (tree: HastNode) => {
  const walk = (node: HastNode) =>
    node.children?.forEach((child, i, all) => {
      if (child.type === 'text' && all[i - 1]?.tagName === 'br')
        child.value = child.value?.replace(/^\n/, '');
      walk(child);
    });
  walk(tree);
};

// A study log memo written in Markdown (#16). HTML in the memo is shown as text, never rendered,
// and react-markdown's default URL check empties javascript: and other unsafe links.
// `clamp` keeps a list entry to its first few lines, like the plain memo before.
export function Memo({ text, clamp = false }: { text: string; clamp?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  // A clamped memo hides its overflow with CSS but the links in the hidden part would stay in the
  // tab order; they leave it while they are cut off, and come back when the box grows.
  useEffect(() => {
    const element = box.current;
    if (!element || !clamp) return;
    const update = () => {
      const visible = element.clientHeight;
      element.querySelectorAll('a').forEach((link) => {
        if (visible > 0 && link.offsetTop >= visible) link.setAttribute('tabindex', '-1');
        else link.removeAttribute('tabindex');
      });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [text, clamp]);
  return (
    <div ref={box} className={clamp ? 'memo clamp' : 'memo'}>
      <Markdown
        rehypePlugins={[singleBreaks]}
        components={{
          // Links leave the app in a new tab, so an unsaved form is not lost. A link or image
          // whose address the URL check emptied is left as its text.
          a: ({ href, children }) =>
            href ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ) : (
              <>{children}</>
            ),
          img: ({ src, alt }) =>
            typeof src === 'string' && src ? <img src={src} alt={alt ?? ''} /> : <>{alt}</>,
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
