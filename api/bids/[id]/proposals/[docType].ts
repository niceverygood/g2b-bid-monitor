import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBidById, getProposal, saveProposal } from '../../../../lib/db';
import { generateProposal, DOC_TYPES, DocType } from '../../../../lib/proposal-generator';

export const config = { maxDuration: 120 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = parseInt(req.query.id as string);
  const docType = req.query.docType as DocType;
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  if (!DOC_TYPES[docType]) return res.status(400).json({ error: '유효하지 않은 문서 유형' });

  try {
    const bid = await getBidById(id);
    if (!bid) return res.status(404).json({ error: 'Not found' });

    if (req.method === 'GET') {
      const proposal = await getProposal(bid.bid_ntce_no, docType);
      if (!proposal) return res.status(404).json({ error: '생성된 문서가 없습니다' });
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
