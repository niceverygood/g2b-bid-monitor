import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBidById, getProposals } from '../../../../lib/db';
import { generateAllProposals, DOC_TYPES } from '../../../../lib/proposal-generator';

export const config = { maxDuration: 300 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = parseInt(req.query.id as string);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const bid = await getBidById(id);
    if (!bid) return res.status(404).json({ error: 'Not found' });

    if (req.method === 'GET') {
      const proposals = await getProposals(bid.bid_ntce_no);
      return res.json({ proposals, allTypes: DOC_TYPES });
    }

    if (req.method === 'POST') {
      const results = await generateAllProposals(id);
      return res.json({ results });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
