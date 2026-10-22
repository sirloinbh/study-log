export type Textbook = {
  id: number;
  title: string;
  author: string;
  edition: string;
};

export type TextbookForm = Omit<Textbook, 'id'>;

// Same limits as the API; the server still validates and trims.
export const limits = { title: 200, author: 200, edition: 50 } as const;

export const emptyTextbookForm = (): TextbookForm => ({ title: '', author: '', edition: '' });

export type ContentNode = {
  id: number;
  number: string;
  title: string;
  children: ContentNode[];
};

// "1.2 내적", or just the title when there is no number.
export const contentLabel = (content: { number: string; title: string }) =>
  content.number.trim() ? `${content.number} ${content.title}` : content.title;

// The tree as select options in reading order, each indented two spaces per level.
export function contentOptions(nodes: ContentNode[], depth = 0): { id: number; label: string }[] {
  return nodes.flatMap((node) => [
    { id: node.id, label: '  '.repeat(depth) + contentLabel(node) },
    ...contentOptions(node.children, depth + 1),
  ]);
}

// "저자 · 판본", leaving out whichever is blank.
export const textbookMeta = (book: TextbookForm) =>
  [book.author, book.edition].filter((part) => part.trim() !== '').join(' · ');
