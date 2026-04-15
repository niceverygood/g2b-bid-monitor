/**
 * 자체 호스팅 첨부파일 워커 — 메인 루프
 *
 * 주 기능은 두 가지:
 *   (A) 이미 Storage 에 다운로드된 HWP 5.x 파일을 hwp5txt 로 파싱하여
 *       attachment_text 에 채워 넣는다 (Vercel 에서 NEEDS_WORKER 로 표시된 것)
 *   (B) OpenAPI 직링크가 없는 공고는 Playwright 로 g2b 에 접속해
 *       세션 기반으로 원본 파일을 받아오는 폴백 (P1 확장)
 *
 * 현재 구현은 (A) 까지. (B) 는 나중에 claimPlaywrightJobs() 로 분리해 추가.
 *
 * 루프:
 *   while (true) {
 *     jobs = claimWorkerJobs()        // NEEDS_WORKER 엔트리가 있는 공고들
 *     for each job:
 *       process entries with status = NEEDS_WORKER
 *     sleep(POLL_INTERVAL_MS)
 *   }
 */

import { claimWorkerJobs, updateBidAttachments, downloadFromStorage, WorkerBid, AttachmentEntry } from './supabase';
import { hwp5txt } from './hwp5txt';

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 300_000);
const MIN_SCORE = Number(process.env.MIN_SCORE ?? 70);
const MAX_TEXT_PER_FILE = 200_000;

async function processBid(bid: WorkerBid): Promise<void> {
  console.log(
    `\n📋 ${bid.bid_ntce_no} (${bid.total_score}점) — ${bid.bid_ntce_nm.slice(0, 40)}`
  );

  const entries: AttachmentEntry[] = Array.isArray(bid.attachments)
    ? [...bid.attachments]
    : [];
  const existingText: any[] = Array.isArray(bid.attachment_text)
    ? [...bid.attachment_text]
    : [];

  let changed = 0;

  for (const entry of entries) {
    if (entry.status !== 'NEEDS_WORKER') continue;
    if (!entry.storagePath) {
      entry.status = 'FAILED';
      entry.error = 'no storagePath';
      changed++;
      continue;
    }

    try {
      console.log(`  📥 downloading ${entry.storagePath}`);
      const buffer = await downloadFromStorage(entry.storagePath);

      // NEEDS_WORKER 엔트리라도 실제 HWP 5.x (OLE) 파일인지 확인 — 아닌 경우
      // worker 가 처리할 수 없으므로 스킵한다. (예: 확장자 없이 zip/pdf 였는데
      // 상위 dispatch 가 잘못 태깅한 경우)
      const isOleHwp =
        buffer.length >= 8 &&
        buffer[0] === 0xd0 &&
        buffer[1] === 0xcf &&
        buffer[2] === 0x11 &&
        buffer[3] === 0xe0;
      if (!isOleHwp) {
        console.log(`  ⏭️  ${entry.fileName}: not OLE HWP, skip`);
        continue;
      }

      console.log(`  🔧 hwp5txt parsing (${buffer.length} bytes)`);
      const rawText = await hwp5txt(buffer);
      // Postgres JSONB 는 \u0000 escape 를 거부함 — 제거 필요
      // eslint-disable-next-line no-control-regex
      const text = rawText.replace(/\u0000/g, '').replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
      const trimmed =
        text.length > MAX_TEXT_PER_FILE ? text.slice(0, MAX_TEXT_PER_FILE) : text;
      existingText.push({
        sourceIdx: entry.sourceIdx,
        fileName: entry.fileName,
        parser: 'hwp5txt',
        charCount: trimmed.length,
        text: trimmed,
      });
      entry.status = 'PARSED';
      entry.parsedAt = new Date().toISOString();
      entry.error = undefined;
      changed++;
      console.log(`  ✅ parsed ${trimmed.length} chars`);
    } catch (err: any) {
      entry.status = 'FAILED';
      entry.error = `worker hwp5txt: ${err.message}`;
      changed++;
      console.log(`  ❌ ${err.message}`);
    }
  }

  if (changed > 0) {
    const anyParsed = entries.some((e) => e.status === 'PARSED');
    const allFailed = entries.every(
      (e) => e.status === 'FAILED' || e.status === 'PENDING'
    );
    await updateBidAttachments(bid.bid_ntce_no, {
      attachments: entries,
      attachment_text: existingText,
      attachments_status: allFailed ? 'FAILED' : anyParsed ? 'PARSED' : 'DOWNLOADED',
      attachments_parsed_at: anyParsed ? new Date().toISOString() : undefined,
    });
    console.log(`  💾 updated (${changed} entries)`);
  }
}

async function loop(): Promise<void> {
  console.log(
    `🤖 worker started — MIN_SCORE=${MIN_SCORE}, POLL_INTERVAL_MS=${POLL_INTERVAL_MS}`
  );

  while (true) {
    try {
      const jobs = await claimWorkerJobs(MIN_SCORE, 5);
      if (jobs.length === 0) {
        console.log(`… no NEEDS_WORKER jobs`);
      } else {
        console.log(`🎯 ${jobs.length} job(s) claimed`);
        for (const bid of jobs) {
          try {
            await processBid(bid);
          } catch (err: any) {
            console.error(`❌ bid ${bid.bid_ntce_no}: ${err.message}`);
          }
        }
      }
    } catch (err: any) {
      console.error(`loop error: ${err.message}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

loop().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
