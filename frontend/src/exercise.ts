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

// "문제 3", or its place in the list when it has no number.
export const exerciseLabel = (exercise: { number: string }, index: number) =>
  exercise.number.trim() ? `문제 ${exercise.number.trim()}` : `${index + 1}번째 문제`;

// The text copied for asking an AI: where the problem comes from, the problem as typed, and the
// request. Blank lines around the body are dropped; its line breaks and indentation are kept.
export function questionText(
  book: TextbookForm,
  path: { number: string; title: string }[],
  exercise: { number: string; body: string },
) {
  const meta = textbookMeta(book);
  const lines = [
    `교재: ${book.title}${meta ? ` (${meta})` : ''}`,
    `단원: ${path.map(contentLabel).join(' > ')}`,
  ];
  if (exercise.number.trim()) lines.push(`문제 번호: ${exercise.number.trim()}`);
  const body = exercise.body.replace(/^(?:[ \t]*\r?\n)+/, '').trimEnd();
  return [
    ...lines,
    '',
    body,
    '',
    '이 연습문제의 풀이를 단계별로 설명해 주세요. 필요한 개념도 함께 알려 주세요.',
  ].join('\n');
}
