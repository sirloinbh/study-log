# 451 Refuse oversized Excel files before reading them

- `readWorkbook` now reads the zip's central directory first (`checkZipSize` in `backend/src/coding-goal-xlsx.ts`) and answers 400 when the declared unpacked size is over 50 MB, the archive has more than 200 parts, is Zip64, or its directory cannot be read. Nothing is inflated for the check.
- A file that declares small sizes but inflates larger is stopped by the reader, which checks each entry's length.
- Tests: `backend/test/coding-goal-xlsx.test.ts` (crafted central directories, and a real workbook).
