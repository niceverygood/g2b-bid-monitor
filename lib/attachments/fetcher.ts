/**
 * 첨부파일 다운로드 + 파싱 파이프라인
 *
 * 입력: bids.attachments (collector가 OpenAPI에서 추출한 PENDING 엔트리들)
 * 출력:
 *   - Supabase Storage 의 'bid-attachments' 버킷에 원본 파일 업로드
 *   - bids.attachments 엔트리 업데이트 (storagePath, status=DOWNLOADED)
 *   - bids.attachment_text 에 파서 결과 저장 (status=PARSED)
 *
 * 이 모듈은 Vercel Function 에서도 동작 가능한 순수 HTTP fetch 기반이다.
 * OpenAPI 가 제공하는 직링크 URL 은 세션/AES 없이 바로 받을 수 있기 때문.
 * (AES 암호화된 UnityAtchFile 경로는 나중에 Playwright 워커에서 폴백 처리)
 */

import { createHash } from 'crypto';
import { getSupabase } from '../supabase';
import { updateAttachments, type Bid } from '../db';
import type { AttachmentEntry } from '../collector';
import { parseAttachment } from '../parsers';

const STORAGE_BUCKET = 'bid-attachments';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB — 합리적 안전선
const MAX_TEXT_PER_FILE = 200_000; // 파일당 20만자 상한 (LLM 토큰 예산)

export interface FetchAttachmentsResult {
  bidNtceNo: string;
  downloaded: number;
  parsed: number;
  failed: number;
  errors: string[];
}

/**
 * 한 건의 공고에 대해 첨부파일 전체를 다운로드 + 파싱한다.
 */
export async function fetchAndParseAttachments(
  bid: Bid
): Promise<FetchAttachmentsResult> {
  const result: FetchAttachmentsResult = {
    bidNtceNo: bid.bid_ntce_no,
    downloaded: 0,
    parsed: 0,
    failed: 0,
    errors: [],
  };

  const entries: AttachmentEntry[] = Array.isArray(bid.attachments)
    ? bid.attachments
    : [];

  if (entries.length === 0) {
    await updateAttachments(bid.bid_ntce_no, {
      attachments_status: 'SKIPPED',
      attachments_error: 'no attachments in metadata',
    });
    return result;
  }

  await updateAttachments(bid.bid_ntce_no, {
    attachments_status: 'FETCHING',
    attachments_error: null,
  });

  const updatedEntries: AttachmentEntry[] = [];
  const attachmentTexts: Array<{
    sourceIdx: number;
    fileName: string;
    parser: string;
    charCount: number;
    text: string;
    warnings?: string[];
  }> = [];

  for (const entry of entries) {
    const working: AttachmentEntry = { ...entry };

    try {
      // 1) 다운로드
      const { buffer, mime } = await downloadFile(entry.sourceUrl);
      working.fileSize = buffer.byteLength;
      working.mime = mime;

      if (buffer.byteLength > MAX_FILE_SIZE) {
        throw new Error(
          `file too large: ${buffer.byteLength} > ${MAX_FILE_SIZE}`
        );
      }

      // 2) Storage 업로드 — Supabase Storage key 는 ASCII 만 허용하므로
      // 원본 파일명은 attachments JSONB 에 유지하고 storage key 는
      // {idx}_{hash}{ext} 형태로 축약한다.
      const storagePath = `${bid.bid_ntce_no}/${buildStorageKey(entry.sourceIdx, entry.fileName)}`;
      await uploadToStorage(storagePath, buffer, mime);
      working.storagePath = storagePath;
      working.status = 'DOWNLOADED';
      working.downloadedAt = new Date().toISOString();
      result.downloaded++;

      // 3) 파싱 (실패해도 다운로드는 유지)
      try {
        const parsed = await parseAttachment(entry.fileName, buffer);
        // Postgres JSONB 는 \u0000 및 기타 제어문자 escape 를 거부하므로
        // 저장 전에 제거한다.
        const sanitized = sanitizeText(parsed.text);
        const trimmed =
          sanitized.length > MAX_TEXT_PER_FILE
            ? sanitized.slice(0, MAX_TEXT_PER_FILE)
            : sanitized;
        attachmentTexts.push({
          sourceIdx: entry.sourceIdx,
          fileName: entry.fileName,
          parser: parsed.parser,
          charCount: trimmed.length,
          text: trimmed,
          warnings: parsed.warnings,
        });
        working.status = 'PARSED';
        working.parsedAt = new Date().toISOString();
        result.parsed++;
      } catch (parseErr) {
        const msg = (parseErr as Error).message;
        // HWP 5.x 가 hwp5txt 없는 환경에서 실패한 경우는 워커가 나중에
        // 처리할 수 있도록 NEEDS_WORKER 상태로 남겨둔다 (다운로드는 유지).
        if (msg.includes('hwp5txt not installed')) {
          working.status = 'NEEDS_WORKER';
          working.error = 'hwp5txt unavailable — pending worker';
        } else {
          working.error = `parse: ${msg}`;
          result.errors.push(`${entry.fileName}: parse ${msg}`);
        }
      }
    } catch (dlErr) {
      const msg = (dlErr as Error).message;
      working.status = 'FAILED';
      working.error = `download: ${msg}`;
      result.failed++;
      result.errors.push(`${entry.fileName}: ${msg}`);
    }

    updatedEntries.push(working);
  }

  const anyParsed = result.parsed > 0;
  const allFailed = result.failed === entries.length;

  await updateAttachments(bid.bid_ntce_no, {
    attachments: updatedEntries,
    attachment_text: attachmentTexts,
    attachments_status: allFailed ? 'FAILED' : anyParsed ? 'PARSED' : 'DOWNLOADED',
    attachments_error: result.errors.length ? result.errors.join(' | ') : null,
    attachments_fetched_at: new Date().toISOString(),
    attachments_parsed_at: anyParsed ? new Date().toISOString() : undefined,
  });

  return result;
}

/**
 * HTTP 다운로드 — 리다이렉트 자동 추적, timeout 60s
 */
async function downloadFile(
  url: string
): Promise<{ buffer: Buffer; mime: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: '*/*',
        Referer: 'https://www.g2b.go.kr/',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    const mime = res.headers.get('content-type') ?? 'application/octet-stream';
    const arrayBuffer = await res.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), mime };
  } finally {
    clearTimeout(timer);
  }
}

async function uploadToStorage(
  path: string,
  buffer: Buffer,
  mime: string
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, {
      contentType: mime,
      upsert: true,
    });
  if (error) {
    throw new Error(`storage upload: ${error.message}`);
  }
}

/**
 * Postgres JSONB 는 `\u0000` 과 일부 제어문자 escape 를 허용하지 않는다.
 * 파서 출력에 남아있는 NUL / 제어문자를 제거하고, 탭/개행은 유지한다.
 */
function sanitizeText(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u0000/g, '').replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

function buildStorageKey(idx: number, fileName: string): string {
  const extMatch = fileName.match(/\.([a-zA-Z0-9]{1,8})$/);
  const ext = extMatch ? `.${extMatch[1].toLowerCase()}` : '';
  const hash = createHash('sha1').update(fileName).digest('hex').slice(0, 12);
  return `${idx}_${hash}${ext}`;
}
