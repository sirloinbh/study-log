// Text for the table of contents paste box, taken from a PDF (#23). PDF.js itself is loaded only
// when a PDF is picked (pdf-import.ts); this part turns what it reads into lines.

// The first pages read when a PDF has no bookmarks; a table of contents is near the front.
export const pdfPageLimit = 20;
// Bigger files are refused before reading, to keep the browser responsive.
export const pdfSizeLimit = 50 * 1024 * 1024;

export type OutlineItem = { title: string; items: OutlineItem[] };

// Bookmarks as lines, indented two spaces per level so the parser nests them.
export function outlineText(items: OutlineItem[], depth = 0): string[] {
  return items.flatMap((item) => {
    const title = item.title.replace(/\s+/g, ' ').trim();
    return [
      ...(title ? ['  '.repeat(depth) + title] : []),
      ...outlineText(item.items ?? [], depth + 1),
    ];
  });
}

// A piece of text on a page with its position: transform[4] is x, transform[5] is y (up from
// the bottom), and height is the font size.
export type TextPiece = { str: string; transform: number[]; height?: number };

// A page's text pieces back into lines, top to bottom. Pieces on one line are joined; a wide gap
// between them (dot leaders often drop out) becomes two spaces so the parser can drop a page
// number after it. Indentation from the page's left edge becomes leading spaces.
export function pageText(pieces: TextPiece[]): string[] {
  const visible = pieces.filter((piece) => piece.str.trim() && piece.transform?.length >= 6);
  if (!visible.length) return [];
  // A two-column page is read one column after the other, so the columns do not merge by y.
  return splitColumns(visible).flatMap(linesOf);
}

const widthOf = (piece: TextPiece) =>
  (piece as { width?: number }).width ?? piece.str.length * (piece.height || 10) * 0.5;

// Pieces split at a vertical gutter that no piece crosses and that has real text on both sides
// (a column of page numbers is not a column).
function splitColumns(pieces: TextPiece[]): TextPiece[][] {
  const spans = pieces
    .map((p) => ({ start: p.transform[4], end: p.transform[4] + widthOf(p) }))
    .sort((a, b) => a.start - b.start);
  const size = Math.max(...pieces.map((p) => p.height || Math.abs(p.transform[3]) || 10));
  const texty = (list: TextPiece[]) =>
    list.filter((p) => !/^[\d\s.·…_]+$/.test(p.str)).length >= Math.max(2, list.length / 2);
  let reach = spans[0].end;
  for (const span of spans) {
    if (span.start - reach > size * 3) {
      const left = pieces.filter((p) => p.transform[4] < span.start);
      const right = pieces.filter((p) => p.transform[4] >= span.start);
      if (texty(left) && texty(right)) return [...splitColumns(left), ...splitColumns(right)];
    }
    reach = Math.max(reach, span.end);
  }
  return [pieces];
}

function linesOf(visible: TextPiece[]): string[] {
  const size = (piece: TextPiece) => piece.height || Math.abs(piece.transform[3]) || 10;
  const lines: TextPiece[][] = [];
  const byY = [...visible].sort((a, b) => b.transform[5] - a.transform[5]);
  for (const piece of byY) {
    const line = lines.at(-1);
    // Same line: baselines closer than half the font size.
    if (line && Math.abs(line[0].transform[5] - piece.transform[5]) < size(piece) / 2)
      line.push(piece);
    else lines.push([piece]);
  }
  const left = Math.min(...visible.map((piece) => piece.transform[4]));
  return lines.map((line) => {
    line.sort((a, b) => a.transform[4] - b.transform[4]);
    let text = '';
    let end = line[0].transform[4];
    for (const piece of line) {
      const gap = piece.transform[4] - end;
      if (text && gap > size(piece) * 2) text = text.trimEnd() + '  ';
      else if (text && gap > size(piece) * 0.2 && !/\s$/.test(text)) text += ' ';
      text += piece.str;
      // Without a width, assume about half the font size per character.
      end = piece.transform[4] + widthOf(piece);
    }
    const indent = Math.max(0, Math.round((line[0].transform[4] - left) / (size(line[0]) / 2)));
    return ' '.repeat(indent) + text.trim();
  });
}
