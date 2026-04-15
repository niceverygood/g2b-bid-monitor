import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveBid, getProposals, getProposal } from '../../../../lib/db';
import { generateAllProposals, DOC_TYPES, DocType } from '../../../../lib/proposal-generator';
import { markdownToDocx, bundleZip, safeFilename } from '../../../../lib/doc-exporter';
import { createJob, makeJobLogger, finishJob, failJob } from '../../../../lib/jobs';

export const config = { maxDuration: 300 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const key = (req.query.id as string)?.trim();
  const format = (req.query.format as string) || 'json';
  if (!key) return res.status(400).json({ error: 'Invalid id' });

  try {
    const bid = await resolveBid(key);
    if (!bid) return res.status(404).json({ error: 'Not found' });
    const id = bid.id!;

    if (req.method === 'GET') {
      if (format === 'zip') {
        // ASCII-safe filenames inside the zip for cross-platform unzip reliability
        // (JSZip doesn't set the EFS UTF-8 flag, so Korean names break on macOS/Linux unzip)
        const ORDER: Record<DocType, string> = {
          technical: '01_technical',
          execution: '02_execution',
          personnel: '03_personnel',
          company: '04_company',
          track_record: '05_track_record',
          pricing: '06_pricing',
        };
        const files: { name: string; content: Buffer }[] = [];
        for (const docType of Object.keys(DOC_TYPES) as DocType[]) {
          const p = await getProposal(bid.bid_ntce_no, docType);
          if (!p) continue;
          const title = `${DOC_TYPES[docType]} — ${bid.bid_ntce_nm}`;
          const buf = await markdownToDocx(p.content, title);
          files.push({
            name: `${ORDER[docType]}_${bid.bid_ntce_no}.docx`,
            content: buf,
          });
        }
        if (files.length === 0) return res.status(404).json({ error: '생성된 제안서가 없습니다' });
        const zipBuf = await bundleZip(files);
        const zipName = `bottle_proposals_${bid.bid_ntce_no}.zip`;
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);
        return res.send(zipBuf);
      }

      const proposals = await getProposals(bid.bid_ntce_no);
      return res.json({ proposals, allTypes: DOC_TYPES });
    }

    if (req.method === 'POST') {
      // Background job: return 202 + job_id, run generation while the handler
      // promise keeps the function alive.
      const jobId = await createJob(id, bid.bid_ntce_no, 'proposals', bid.bid_ntce_nm);
      res.status(202).json({
        job_id: jobId,
        status: 'running',
        bid_ntce_no: bid.bid_ntce_no,
        poll_url: `/api/jobs/${jobId}`,
      });

      try {
        const logger = makeJobLogger(jobId);
        const results = await generateAllProposals(id, { onLog: logger });
        const allOk = results.every(r => r.success);
        await finishJob(
          jobId,
          allOk ? 'success' : 'partial',
          { results },
          allOk ? '🏁 제안서 전체 생성 완료' : '🏁 제안서 생성 완료 (일부 실패)'
        );
      } catch (error: any) {
        await failJob(jobId, error?.message || String(error));
      }
      return;
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    if (!res.headersSent) res.status(500).json({ error: error.message });
  }
}
