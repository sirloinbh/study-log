import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, test } from 'vitest';

import { fakeApi } from './test/fake-api';
import { render } from './test/render';
import { Textbooks } from './textbooks';

// #482: a store link fills the form, nothing is saved until Register is pressed.
function server(linkAnswer: { status?: number; body: unknown }) {
  return fakeApi(({ method, path }) => {
    if (path === '/api/textbooks/from-link') return linkAnswer;
    if (path === '/api/textbooks' && method === 'GET') return { body: { textbooks: [] } };
    if (path === '/api/textbooks' && method === 'POST')
      return { status: 201, body: { textbook: { id: 1 } } };
    return undefined;
  });
}

const link = 'https://www.yes24.com/Product/Goods/1';
const paste = async () => {
  fireEvent.change(await screen.findByLabelText(/Fill in from a Yes24/), {
    target: { value: link },
  });
};

test('a link fills the title, author and edition without saving', async () => {
  const api = server({
    body: { textbook: { title: 'Clean Code', author: 'Robert Martin', edition: '3rd' } },
  });
  render(<Textbooks />);
  expect(screen.queryByRole('button', { name: 'Fill in' })).toBeDisabled();
  await paste();
  fireEvent.click(screen.getByRole('button', { name: 'Fill in' }));
  expect(await screen.findByText(/Filled in from the link/)).toBeInTheDocument();
  expect(screen.getByLabelText('Title')).toHaveValue('Clean Code');
  expect(screen.getByLabelText('Author')).toHaveValue('Robert Martin');
  expect(screen.getByLabelText('Edition')).toHaveValue('3rd');
  expect(screen.getByLabelText(/Fill in from a Yes24/)).toHaveValue('');
  expect(api.sent).toEqual([
    { method: 'POST', path: '/api/textbooks/from-link', body: { url: link } },
  ]);

  // The person can still fix it and then register it.
  fireEvent.change(screen.getByLabelText('Edition'), { target: { value: '3rd edition' } });
  fireEvent.click(screen.getByRole('button', { name: 'Register' }));
  await waitFor(() => expect(api.sent).toHaveLength(2));
  expect(api.sent[1]).toEqual({
    method: 'POST',
    path: '/api/textbooks',
    body: { title: 'Clean Code', author: 'Robert Martin', edition: '3rd edition' },
  });
});

test('Enter in the link field reads the link and does not register', async () => {
  const api = server({ body: { textbook: { title: 'A', author: '', edition: '' } } });
  render(<Textbooks />);
  await paste();
  fireEvent.keyDown(screen.getByLabelText(/Fill in from a Yes24/), { key: 'Enter' });
  await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('A'));
  expect(api.sent.map((request) => request.path)).toEqual(['/api/textbooks/from-link']);
});

test('a refused link shows the message and leaves the form as it was', async () => {
  server({
    status: 400,
    body: { error: 'Only https links on Yes24 or Kyobo Book Centre are accepted' },
  });
  render(<Textbooks />);
  fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Typed' } });
  await paste();
  fireEvent.click(screen.getByRole('button', { name: 'Fill in' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/Only https links/);
  expect(screen.getByLabelText('Title')).toHaveValue('Typed');
  expect(screen.getByLabelText(/Fill in from a Yes24/)).toHaveValue(link);
});
