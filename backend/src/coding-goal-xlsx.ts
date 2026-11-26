import ExcelJS from 'exceljs';

import { maxSheetRows } from './coding-goal-import.js';
import type { Sheet, WorkbookReader } from './coding-goals.js';
import { HttpError } from './standard/http.js';

// A sheet this long is refused without reading further: rows past the limit are never imported.
const readLimit = maxSheetRows + 1_000;
const maxColumns = 200;

const pad = (n: number) => String(n).padStart(2, '0');

// The text of one cell. Dates become YYYY-MM-DD (in UTC: Excel stores no time zone), formulas give
// their result, rich text and links their text.
export function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date)
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((part) => part.text).join('');
    if ('result' in value) return cellText(value.result);
    if ('text' in value) return cellText(value.text);
    if ('error' in value) return '';
    return '';
  }
  return String(value);
}

// Reads every sheet of an .xlsx file as rows of text, with the header as the first row. A gap in
// the row numbers stays as an empty row so a row keeps its number from the sheet.
export const readWorkbook: WorkbookReader = async (file) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file as unknown as ArrayBuffer);
  return workbook.worksheets.map((worksheet): Sheet => {
    const rows: string[][] = [];
    worksheet.eachRow({ includeEmpty: false }, (row, number) => {
      if (number > readLimit) throw new HttpError(400, `The sheet ${worksheet.name} is too long`);
      const cells: string[] = [];
      row.eachCell({ includeEmpty: false }, (cell, column) => {
        if (column <= maxColumns) cells[column - 1] = cellText(cell.value);
      });
      while (rows.length < number - 1) rows.push([]);
      rows.push(Array.from(cells, (cell) => cell ?? ''));
    });
    return { name: worksheet.name, rows };
  });
};
