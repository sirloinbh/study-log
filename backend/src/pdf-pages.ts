import { inflateSync } from 'node:zlib';

// How many pages a PDF has, counted before the file is sent to a paid API (#267). No PDF library is
// installed, so this reads the page objects (`/Type /Page`, not `/Type /Pages`) from the raw bytes
// and from the compressed object streams that PDF 1.5 and later keep them in. A file it cannot read
// that way (encrypted, or an unusual layout) answers undefined, and the other limits still apply.
const page = /\/Type\s*\/Page(?![A-Za-z])/g;
const objectStreamType = /\/Type\s*\/ObjStm/g;
// What follows the dictionary of a stream object.
const streamStart = /^\s{0,8}stream\r?\n/;

// The dictionary of an object stream is short; looking further than this for its end keeps a crafted
// file from making the search slow.
const dictionaryWindow = 512;
// A stream that inflates to more than this is not a real object stream, and a file may not make the
// server inflate more than the total in all.
const maxInflatedBytes = 64 * 1024 * 1024;
const maxInflatedTotal = 256 * 1024 * 1024;

const count = (text: string) => [...text.matchAll(page)].length;

export function countPdfPages(bytes: Buffer): number | undefined {
  // latin1 keeps one character per byte, so an index in the text is an index in the bytes.
  const text = bytes.toString('latin1');
  let pages = count(text);
  let inflatedTotal = 0;
  for (const match of text.matchAll(objectStreamType)) {
    const from = match.index + match[0].length;
    const close = text.slice(from, from + dictionaryWindow).indexOf('>>');
    if (close < 0) continue;
    const afterDictionary = from + close + 2;
    const stream = streamStart.exec(text.slice(afterDictionary, afterDictionary + 16));
    if (!stream) continue;
    const start = afterDictionary + stream[0].length;
    const end = text.indexOf('endstream', start);
    if (end < 0) continue;
    try {
      const inflated = inflateSync(bytes.subarray(start, end), {
        maxOutputLength: Math.min(maxInflatedBytes, maxInflatedTotal - inflatedTotal),
      });
      inflatedTotal += inflated.length;
      pages += count(inflated.toString('latin1'));
    } catch {
      // Not deflated, too large, or not a valid stream: nothing to count in it.
    }
    if (inflatedTotal >= maxInflatedTotal) break;
  }
  return pages > 0 ? pages : undefined;
}
