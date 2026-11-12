import { contentLabel, type ContentNode, type TextbookForm, textbookMeta } from './textbook';

export type Exercise = {
  id: number;
  textbookId: number;
  contentId: number;
  number: string;
  body: string;
  important: boolean;
};

export type ExerciseForm = Pick<Exercise, 'number' | 'body' | 'important'>;

export type ExerciseAnswer = { exerciseId: number; body: string };

// The Korean translation of an exercise and its answer (#31). `stale`: the exercise or its answer
// changed after it was made.
export type ExerciseTranslation = {
  body: string;
  answer: string | null;
  model: string;
  updatedAt: string;
  stale: boolean;
};

// Same limits as the API; the server still validates.
export const exerciseLimits = { number: 20, body: 20000, answer: 20000 } as const;

export const emptyExerciseForm = (): ExerciseForm => ({ number: '', body: '', important: false });

// The entries from the chapter down to `id`, or undefined when the tree does not have it.
export function contentPath(nodes: ContentNode[], id: number): ContentNode[] | undefined {
  for (const node of nodes) {
    if (node.id === id) return [node];
    const below = contentPath(node.children, id);
    if (below) return [node, ...below];
  }
  return undefined;
}

// "Problem 3", or its place in the list when it has no number.
export const exerciseLabel = (exercise: { number: string }, index: number) =>
  exercise.number.trim() ? `Problem ${exercise.number.trim()}` : `Problem #${index + 1}`;

// The text copied for asking an AI: where the problem comes from, the problem as typed, and the
// request. Blank lines around the body are dropped; its line breaks and indentation are kept.
export function questionText(
  book: TextbookForm,
  path: { number: string; title: string }[],
  exercise: { number: string; body: string },
) {
  const meta = textbookMeta(book);
  const lines = [
    `Textbook: ${book.title}${meta ? ` (${meta})` : ''}`,
    `Section: ${path.map(contentLabel).join(' > ')}`,
  ];
  if (exercise.number.trim()) lines.push(`Problem number: ${exercise.number.trim()}`);
  const body = exercise.body.replace(/^(?:[ \t]*\r?\n)+/, '').trimEnd();
  return [
    ...lines,
    '',
    body,
    '',
    'Please explain how to solve this exercise step by step, and mention the concepts it needs.',
  ].join('\n');
}
