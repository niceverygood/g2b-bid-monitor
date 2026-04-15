import { getSupabase } from '../lib/supabase';

async function main() {
  const bidNtceNo = process.argv[2] || 'R26BK01459045';
  const sb = getSupabase();
  const { data, error } = await sb
    .from('bids')
    .select('bid_ntce_no, bid_ntce_nm, attachments, attachment_text, attachments_status, attachments_error')
    .eq('bid_ntce_no', bidNtceNo)
    .maybeSingle();
  if (error || !data) {
    console.error('not found', error?.message);
    process.exit(1);
  }
  console.log(`📋 ${data.bid_ntce_no} — ${data.bid_ntce_nm}`);
  console.log(`status: ${data.attachments_status}  err: ${data.attachments_error || '-'}`);
  console.log(`\n첨부 엔트리:`);
  for (const a of (data.attachments ?? []) as any[]) {
    console.log(`  [${a.sourceIdx}] ${a.status}  ${a.fileSize ?? '-'}B  ${a.mime ?? ''}  → ${a.fileName}`);
  }
  console.log(`\n텍스트 엔트리:`);
  for (const t of (data.attachment_text ?? []) as any[]) {
    const preview = (t.text ?? '').replace(/\s+/g, ' ').slice(0, 120);
    console.log(`  [${t.sourceIdx}] ${t.parser}  ${t.charCount.toLocaleString()}자  :: ${preview}…`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
