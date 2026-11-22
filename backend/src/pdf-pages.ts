import { inflateSync } from 'node:zlib';

// How many pages a PDF has, counted before the file is sent to a paid API (#267). No PDF library is
// installed, so this reads the page objects (`/Type /Page`, not `/Type /Pages`) from the raw bytes
// and from the compressed object streams that PDF 1.5 and later keep them in. A file it cannot read
// that way (encrypted, or an unusual layout) answers undefined, and the other limits still apply.
const page = /\/Type\s*\/Page(?![A-Za-z])/g;
const objectStream = /<<[^<>]*\/Type\s*\/ObjStm[^<>]*>>\s*stream\r?\n/g;

// A stream that inflates to more than this is not a real object stream.
const maxInflatedBytes = 64 * 1024 * 1024;

const count = (text: string) => [...text.matchAll(page)].length;

export function countPdfPages(bytes: Buffer): number | undefined {
  // latin1 keeps one character per byte, so an index in the text is an index in the bytes.
  const text = bytes.toString('latin1');
  let pages = count(text);
  for (const match of text.matchAll(objectStream)) {
    const start = match.index + match[0].length;
    const end = text.indexOf('endstream', start);
    if (end < 0) continue;
    try {
      const inflated = inflateSync(bytes.subarray(start, end), {
        maxOutputLength: maxInflatedBytes,
      });
      pages += count(inflated.toString('latin1'));
    } catch {
      // Not deflated, or not a valid stream: nothing to count in it.
    }
  }
  return pages > 0 ? pages : undefined;
}
