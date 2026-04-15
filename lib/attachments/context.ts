/**
 * attachment_text JSONB 를 AI 프롬프트에 꽂을 수 있는 컨텍스트 블록으로 변환.
 *
 * 여러 소비자(proposal-generator, checklist-generator, price-advisor)가
 * 공용으로 쓰도록 분리. 호출 측에서 budget 을 넘겨 토큰 예산을 조절한다.
 *
 * 정책:
 *   - attachment_text 엔트리는 sourceIdx 순(보통 공고문→규격서→제안요청서)
 *   - 앞쪽 파일부터 예산 소진할 때까지 채움
 *   - 각 파일 헤더로 파일명/파서 명시 → AI가 어떤 문서에서 온 정보인지 구분 가능
 */

import type { Bid } from '../db';

export interface AttachmentTextEntry {
  sourceIdx?: number;
  fileName: string;
  parser: string;
  charCount?: number;
  text: string;
  warnings?: string[];
}

/**
 * 프롬프트용 첨부 컨텍스트를 만든다. 첨부가 없으면 빈 문자열.
 *
 * @param bid - attachment_text 필드를 읽을 공고
 * @param budget - 전체 문자수 상한 (기본 50,000자 ≈ 약 17K token)
 * @param title - 블록 제목 (기본 "공고 첨부파일 원문")
 */
export function buildAttachmentContext(
  bid: Bid,
  budget = 50_000,
  title = '공고 첨부파일 원문 (공고문/규격서/제안요청서)'
): string {
  const raw = bid.attachment_text;
  const texts: AttachmentTextEntry[] = Array.isArray(raw) ? raw : [];
  if (texts.length === 0) return '';

  let remaining = budget;
  const blocks: string[] = [];

  for (const entry of texts) {
    if (remaining <= 500) break;
    if (!entry?.text) continue;
    const slice = entry.text.slice(0, remaining);
    remaining -= slice.length;
    blocks.push(
      `### 📎 ${entry.fileName} (${entry.parser})\n\`\`\`\n${slice}\n\`\`\``
    );
  }

  if (blocks.length === 0) return '';

  return `\n\n## ${title}\n${blocks.join('\n\n')}`;
}
