import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveBid, getProposal, saveProposal } from '../../../../lib/db';
import { generateProposal, DOC_TYPES, DocType } from '../../../../lib/proposal-generator';
import { markdownToDocx, safeFilename } from '../../../../lib/doc-exporter';

export const config = { maxDuration: 120 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const key = (req.query.id as string)?.trim();
  const docType = req.query.docType as DocType;
  const format = (req.query.format as string) || 'json';
  if (!key) return res.status(400).json({ error: 'Invalid id' });
  if (!DOC_TYPES[docType]) return res.status(400).json({ error: '유효하지 않은 문서 유형' });

  try {
    const bid = await resolveBid(key);
    if (!bid) return res.status(404).json({ error: 'Not found' });
    const id = bid.id!;

    if (req.method === 'GET') {
      const proposal = await getProposal(bid.bid_ntce_no, docType);
      if (!proposal) return res.status(404).json({ error: '생성된 문서가 없습니다' });

      if (format === 'docx') {
        const title = `${DOC_TYPES[docType]} — ${bid.bid_ntce_nm}`;
        const buffer = await markdownToDocx(proposal.content, title);
        const asciiName = `${docType}_${bid.bid_ntce_no}.docx`;
        const utf8Name = safeFilename(`${DOC_TYPES[docType]}_${bid.bid_ntce_no}.docx`);
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        );
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(utf8Name)}`
        );
        return res.send(buffer);
      }

      return res.json({ docType, label: DOC_TYPES[docType], ...proposal });
    }

    if (req.method === 'POST') {
      const content = await generateProposal(id, docType);
      await saveProposal(bid.bid_ntce_no, docType, content);
      return res.json({ docType, label: DOC_TYPES[docType], content });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
