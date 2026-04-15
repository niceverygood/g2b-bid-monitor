import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveBid } from '../../../../lib/db';
import { fetchAndParseAttachments } from '../../../../lib/attachments/fetcher';

/**
 * GET  /api/bids/:id/attachments       → 현재 저장된 첨부 메타 + 파싱 텍스트
 * POST /api/bids/:id/attachments       → 다운로드 + 파싱 트리거 (동기, maxDuration 내)
 *
 * 동기 실행이지만 첨부파일 개수 × 파일당 1~5초 정도라
 * 일반적으로 60초 한도 내에서 완료된다. 느린 공고는 cron/auto-pipeline 경유.
 */
export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const key = (req.query.id as string)?.trim();
  if (!key) return res.status(400).json({ error: 'Invalid id' });

  try {
    const bid = await resolveBid(key);
    if (!bid) return res.status(404).json({ error: 'Not found' });

    if (req.method === 'GET') {
      return res.json({
        bid_ntce_no: bid.bid_ntce_no,
        attachments: bid.attachments ?? [],
        attachment_text: Array.isArray(bid.attachment_text)
          ? (bid.attachment_text as Array<Record<string, unknown>>).map((t) => ({
              sourceIdx: t.sourceIdx,
              fileName: t.fileName,
              parser: t.parser,
              charCount: t.charCount,
              warnings: t.warnings,
            }))
          : [],
        status: bid.attachments_status,
        error: bid.attachments_error,
        fetched_at: bid.attachments_fetched_at,
        parsed_at: bid.attachments_parsed_at,
      });
    }

    if (req.method === 'POST') {
      const result = await fetchAndParseAttachments(bid);
      return res.json(result);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    if (!res.headersSent) res.status(500).json({ error: error.message });
  }
}
