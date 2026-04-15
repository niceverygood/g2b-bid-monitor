/**
 * 파서 디스패처
 *
 * 각 파일 확장자별로 적절한 파서를 호출해 텍스트를 추출한다.
 *
 * 설계 원칙:
 *   - 가능한 한 PDF 변환을 피하고 직접 텍스트만 뽑는다 (속도 + 안정성)
 *   - HWPX는 zip+XML이라 jszip으로 파싱 (외부 프로세스 0개)
 *   - HWP 5.x 바이너리는 hwp5txt (pyhwp) 사이드카 — 텍스트 추출 전용, PDF 경유 X
 *   - PDF는 pdfjs-dist (Node용 legacy build)
 *   - XLSX는 SheetJS, DOCX는 mammoth
 */

import { parsePdf } from './pdf';
import { parseHwpx } from './hwpx';
import { parseHwp } from './hwp';
import { parseXlsx } from './xlsx';
import { parseDocx } from './docx';

export interface ParseResult {
  parser: string;
  charCount: number;
  text: string;
  warnings?: string[];
}

/**
 * 파일 버퍼에서 텍스트를 추출한다.
 *
 * @param fileName - 확장자 판별용 원본 파일명
 * @param buffer - 파일 바이너리
 */
export async function parseAttachment(
  fileName: string,
  buffer: Buffer
): Promise<ParseResult> {
  const lower = fileName.toLowerCase();
  const ext = detectExtension(lower, buffer);

  if (ext === 'pdf') return parsePdf(buffer);
  if (ext === 'hwpx') return parseHwpx(buffer);
  if (ext === 'hwp') return parseHwp(buffer);
  if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsb') return parseXlsx(buffer);
  if (ext === 'docx') return parseDocx(buffer);
  if (ext === 'txt') {
    const text = buffer.toString('utf-8');
    return { parser: 'plain', charCount: text.length, text };
  }

  throw new Error(`Unsupported file type: ${fileName}`);
}

/**
 * 파일명 확장자 우선, 없으면 매직 바이트로 판별.
 * 표준공고문처럼 확장자가 없는 엔트리를 위해.
 */
function detectExtension(lowerName: string, buffer: Buffer): string | null {
  const m = lowerName.match(/\.([a-z0-9]{1,8})$/);
  if (m) return m[1];

  // PDF: "%PDF-"
  if (buffer.length >= 5 && buffer.slice(0, 5).toString('ascii') === '%PDF-') {
    return 'pdf';
  }
  // ZIP-based (hwpx / xlsx / docx): PK\x03\x04
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    // HWPX 는 mimetype 파일에 application/hwp+zip 이 들어있음
    const head = buffer.slice(0, Math.min(buffer.length, 256)).toString('utf-8');
    if (head.includes('hwp+zip')) return 'hwpx';
    if (head.includes('word/')) return 'docx';
    if (head.includes('xl/')) return 'xlsx';
    return 'hwpx'; // 가장 흔한 케이스 — 이후 파서가 실패하면 FAILED 로 기록됨
  }
  // HWP 5.x 바이너리 (OLE compound file): D0 CF 11 E0 A1 B1 1A E1
  if (
    buffer.length >= 8 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  ) {
    return 'hwp';
  }
  return null;
}
