/**
 * DOCX 파서 — mammoth
 *
 * mammoth.extractRawText 가 가장 빠르고 구조 유지 정도도 AI 프롬프트에 충분하다.
 */

import type { ParseResult } from './index';

export async function parseDocx(buffer: Buffer): Promise<ParseResult> {
  const mammoth = await import('mammoth');
  const { value, messages } = await mammoth.extractRawText({ buffer });

  const warnings = messages
    .filter((m) => m.type === 'warning' || m.type === 'error')
    .map((m) => m.message);

  return {
    parser: 'mammoth',
    charCount: value.length,
    text: value,
    warnings: warnings.length ? warnings : undefined,
  };
}
