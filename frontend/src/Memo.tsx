import React from 'react';
import Markdown from 'react-markdown';

// A study log memo written in Markdown (#16). HTML in the memo is shown as text, never rendered,
// and react-markdown's default URL check empties javascript: and other unsafe links.
// `clamp` keeps a list entry to its first few lines, like the plain memo before.
export function Memo({ text, clamp = false }: { text: string; clamp?: boolean }) {
  return (
    <div className={clamp ? 'memo clamp' : 'memo'}>
      <Markdown
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
