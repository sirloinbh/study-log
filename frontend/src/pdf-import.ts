import { outlineText, pageText, pdfPageLimit, type OutlineItem, type TextPiece } from './pdf-toc';

export type PdfToc = { lines: string[]; source: 'outline' | 'pages'; pages: number };

// Reads a table of contents from a PDF in the browser (#23): its bookmarks when it has them,
// otherwise the text of its first pages. PDF.js is loaded here, on first use, so the rest of
// the app does not carry it. Only text is read; nothing in the PDF is rendered or run (PDF.js 6
// has no eval path, the one behind CVE-2024-4367).
export async function readPdfToc(file: { arrayBuffer(): Promise<ArrayBuffer> }): Promise<PdfToc> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const pdf = await task.promise;
    const outline = (await pdf.getOutline()) as OutlineItem[] | null;
    const fromOutline = outline ? outlineText(outline) : [];
    if (fromOutline.length) return { lines: fromOutline, source: 'outline', pages: 0 };
    const pages = Math.min(pdf.numPages, pdfPageLimit);
    const lines: string[] = [];
    for (let number = 1; number <= pages; number++) {
      const content = await (await pdf.getPage(number)).getTextContent();
      lines.push(...pageText(content.items as TextPiece[]));
    }
    return { lines, source: 'pages', pages };
  } finally {
    await task.destroy();
  }
}
