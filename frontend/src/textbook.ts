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

// "저자 · 판본", leaving out whichever is blank.
export const textbookMeta = (book: TextbookForm) =>
  [book.author, book.edition].filter((part) => part.trim() !== '').join(' · ');
