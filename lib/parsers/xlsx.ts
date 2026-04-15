/**
 * XLSX/XLS 파서 — SheetJS (xlsx)
 *
 * 각 시트를 TSV 로 덤프해서 이어붙인다. 행/열 구조가 AI 프롬프트에서도 그대로 읽힘.
 */

import type { ParseResult } from './index';

export async function parseXlsx(buffer: Buffer): Promise<ParseResult> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const sections: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const tsv = XLSX.utils.sheet_to_csv(sheet, { FS: '\t' });
    sections.push(`### ${sheetName}\n${tsv}`);
  }

  const text = sections.join('\n\n').trim();
  return {
    parser: 'xlsx',
    charCount: text.length,
    text,
  };
}
