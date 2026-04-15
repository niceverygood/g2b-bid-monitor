/**
 * PDF 텍스트 추출 — pdfjs-dist (legacy Node build)
 *
 * pdf-parse 대신 pdfjs를 쓰는 이유: pdf-parse는 CommonJS 전용이고
 * 내부적으로 테스트 PDF를 읽으려고 해서 Vercel/Docker에서 불안정.
 * pdfjs-dist의 legacy build는 순수 Node 환경에서 안정적으로 동작한다.
 */

import type { ParseResult } from './index';

export async function parsePdf(buffer: Buffer): Promise<ParseResult> {
  // legacy build (Node ESM). 런타임에 동적 import — 번들 크기 최소화.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const uint8 = new Uint8Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength
  );

  const loadingTask = pdfjs.getDocument({
    data: uint8,
    // 한글 PDF에서 cmap 필요한 경우 대비 — 실패해도 계속 진행
    useSystemFonts: true,
    isEvalSupported: false,
  });

  const doc = await loadingTask.promise;
  const pages: string[] = [];
  const warnings: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    try {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: any) => ('str' in item ? item.str : ''))
        .join(' ');
      pages.push(pageText);
    } catch (err) {
      warnings.push(`page ${i}: ${(err as Error).message}`);
    }
  }

  await doc.destroy();

  const text = pages.join('\n\n');
  return {
    parser: 'pdfjs',
    charCount: text.length,
    text,
    warnings: warnings.length ? warnings : undefined,
  };
}
