import { contentLabel } from './textbook';

export type Review = {
  id: number;
  round: number;
  dueDate: string;
  studyDate: string;
  memo: string;
  textbookTitle: string | null;
  contentNumber: string | null;
  contentTitle: string | null;
};

const dayMs = 86_400_000;
const memoTitleLength = 40;

// Whole days from `dueDate` to `today`, both YYYY-MM-DD, so no local time zone shifts a day.
export const overdueDays = (dueDate: string, today: string) =>
  Math.max(0, (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / dayMs);

// What was studied: the textbook and chapter, or else the memo's first line, or else the date.
export function reviewTitle(review: Review) {
  if (review.textbookTitle) {
    const content =
      review.contentTitle === null
        ? ''
        : ` · ${contentLabel({ number: review.contentNumber ?? '', title: review.contentTitle })}`;
    return `${review.textbookTitle}${content}`;
  }
  const line = review.memo
    .split('\n')
    .map((text) => text.trim())
    .find(Boolean);
  if (!line) return `${review.studyDate} 학습`;
  return line.length > memoTitleLength ? `${line.slice(0, memoTitleLength)}…` : line;
}
