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

// What the page can list; each key is also the API path.
export const reviewRanges = {
  today: { label: 'Today', heading: 'Reviews for today', empty: 'Nothing to review today' },
  week: { label: 'This week', heading: 'Reviews this week', empty: 'Nothing to review this week' },
  all: { label: 'All', heading: 'All reviews', empty: 'No reviews left' },
} as const;

export type ReviewRange = keyof typeof reviewRanges;

const dayMs = 86_400_000;

// Whole days from `dueDate` to `today`, both YYYY-MM-DD, so no local time zone shifts a day.
export const overdueDays = (dueDate: string, today: string) =>
  Math.max(0, (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / dayMs);

// What was studied: the textbook and chapter, or else the date. The memo is Markdown, so it is
// shown below the title rather than cut into it.
export function reviewTitle(review: Review) {
  if (!review.textbookTitle) return `${review.studyDate} study`;
  const content =
    review.contentTitle === null
      ? ''
      : ` · ${contentLabel({ number: review.contentNumber ?? '', title: review.contentTitle })}`;
  return `${review.textbookTitle}${content}`;
}
