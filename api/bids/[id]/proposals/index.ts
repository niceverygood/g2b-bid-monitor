import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBidById, getProposals, getProposal } from '../../../../lib/db';
import { generateAllProposals, DOC_TYPES, DocType } from '../../../../lib/proposal-generator';
import { markdownToDocx, bundleZip, safeFilename } from '../../../../lib/doc-exporter';

export const config = { maxDuration: 300 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = parseInt(req.query.id as string);
  const format = (req.query.format as string) || 'json';
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const bid = await getBidById(id);
    if (!bid) return res.status(404).json({ error: 'Not found' });

    if (req.method === 'GET') {
      if (format === 'zip') {
        const files: { name: string; content: Buffer }[] = [];
        for (const docType of Object.keys(DOC_TYPES) as DocType[]) {
          const p = await getProposal(bid.bid_ntce_no, docType);
          if (!p) continue;
          const title = `${DOC_TYPES[docType]} — ${bid.bid_ntce_nm}`;
          const buf = await markdownToDocx(p.content, title);
          files.push({
            name: safeFilename(`${DOC_TYPES[docType]}_${bid.bid_ntce_no}.docx`),
            content: buf,
          });
        }
        if (files.length === 0) return res.status(404).json({ error: '생성된 제안서가 없습니다' });
        const zipBuf = await bundleZip(files);
        const zipName = safeFilename(`바틀_제안서_${bid.bid_ntce_no}.zip`);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename*=UTF-8''${encodeURIComponent(zipName)}`
        );
        return res.send(zipBuf);
      }

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
