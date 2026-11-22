import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, test } from 'vitest';

import { fakeApi } from './test/fake-api';
import type { ContentNode } from './textbook';
import { TextbookContents } from './textbook-contents';

afterEach(cleanup);

// The parent passes a new function on every render and stores what it hears: the contents card
// must call it only when the tree changes, not render forever.
function Parent() {
  const [heard, setHeard] = useState<{ tree?: ContentNode[] }>();
  return (
    <>
      <p data-testid="heard">{heard?.tree ? heard.tree.length : 'none'}</p>
      <TextbookContents textbookId={1} onTree={(shown) => setHeard({ tree: shown.tree })} />
    </>
  );
}

test('an onTree that is a new function on each render does not loop', async () => {
  const api = fakeApi({
    'GET /api/textbooks/1/contents': {
      body: { contents: [{ id: 1, number: '1', title: 'Vectors', children: [] }] },
    },
  });
  render(<Parent />);
  await waitFor(() => expect(screen.getByTestId('heard')).toHaveTextContent('1'));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(screen.getByTestId('heard')).toHaveTextContent('1');
  expect(api.requests.filter((request) => request.method === 'GET')).toHaveLength(1);
});
