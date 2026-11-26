import ExcelJS from 'exceljs';

import { maxSheetRows } from './coding-goal-import.js';
import type { Sheet, WorkbookReader } from './coding-goals.js';
import { HttpError } from './standard/http.js';

// A sheet this long is refused without reading further: rows past the limit are never imported.
const readLimit = maxSheetRows + 1_000;
const maxColumns = 200;

// What a workbook may hold once unzipped. The upload limit counts compressed bytes, and a few MB of
// repeated data can inflate a thousand-fold, so the archive's own table of sizes is checked first (#451).
export const maxUnzippedBytes = 50 * 1024 * 1024;
export const maxZipEntries = 200;
const notWorkbook = 'The file is not a valid .xlsx workbook';

// Adds up the uncompressed sizes the zip's central directory declares, without inflating anything.
// A file that lies about a size is stopped later by the reader, which checks each entry's length.
export function checkZipSize(file: Buffer) {
  let end = -1;
  for (let at = file.length - 22; at >= Math.max(0, file.length - 22 - 0xffff); at--)
    if (file.readUInt32LE(at) === 0x06054b50) {
      end = at;
      break;
    }
  if (end < 0) throw new HttpError(400, notWorkbook);
  const entries = file.readUInt16LE(end + 10);
  const directory = file.readUInt32LE(end + 16);
  // 0xffff and 0xffffffff mean Zip64, which a normal workbook never needs.
  if (entries === 0xffff || directory === 0xffffffff) throw new HttpError(400, notWorkbook);
  if (entries > maxZipEntries)
    throw new HttpError(400, `The workbook has more than ${maxZipEntries} parts`);
  let at = directory;
  let total = 0;
  for (let i = 0; i < entries; i++) {
    if (at + 46 > file.length || file.readUInt32LE(at) !== 0x02014b50)
      throw new HttpError(400, notWorkbook);
    total += file.readUInt32LE(at + 24);
    if (total > maxUnzippedBytes)
      throw new HttpError(400, 'The workbook is too large once unpacked');
    at += 46 + file.readUInt16LE(at + 28) + file.readUInt16LE(at + 30) + file.readUInt16LE(at + 32);
  }
}

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
  checkZipSize(file);
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
