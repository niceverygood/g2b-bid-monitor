/**
 * HWP 5.x (binary) 파서 — hwp5txt 사이드카
 *
 * 전략:
 *   1) Python pyhwp 패키지의 hwp5txt CLI 사용
 *   2) PDF 경유 X — hwp5txt는 직접 텍스트만 뽑는다 (가장 빠름)
 *   3) Docker 이미지에 `pip install pyhwp` 한 줄이면 끝
 *
 * 대안 검토:
 *   - hwp.js (pure JS): 본문 추출 품질 떨어짐 (테이블/표 누락)
 *   - libhwp (C++): 빌드 복잡, 가치 대비 복잡도 높음
 *   - LibreOffice + H2Orestart → PDF → 텍스트: 5~10초/파일, 불안정
 *
 * 결론: hwp5txt 가 가장 빠르고 신뢰성 높다.
 *
 * 실패 시 폴백: 빈 텍스트 + warning 리턴 (파이프라인은 계속 진행).
 */

import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ParseResult } from './index';

const HWP5TXT_BIN = process.env.HWP5TXT_BIN ?? 'hwp5txt';
const HWP5TXT_TIMEOUT_MS = 30_000;

// Vercel/AWS Lambda 환경 감지 — Python 사이드카 없음
const IS_SERVERLESS =
  !!process.env.VERCEL ||
  !!process.env.AWS_LAMBDA_FUNCTION_NAME ||
  !!process.env.LAMBDA_TASK_ROOT;

// hwp5txt 가용성 캐시 (프로세스 생존 동안 1회만 검사)
let hwp5txtAvailable: boolean | null = null;

export async function isHwp5txtAvailable(): Promise<boolean> {
  if (hwp5txtAvailable !== null) return hwp5txtAvailable;
  if (IS_SERVERLESS && !process.env.HWP5TXT_BIN) {
    hwp5txtAvailable = false;
    return false;
  }
  hwp5txtAvailable = await new Promise<boolean>((resolve) => {
    const proc = spawn(HWP5TXT_BIN, ['--version'], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0 || code === 1));
  });
  return hwp5txtAvailable;
}

export async function parseHwp(buffer: Buffer): Promise<ParseResult> {
  // 사이드카 없는 환경에서는 명시적으로 FAILED 반환 (파이프라인은 계속 진행)
  const available = await isHwp5txtAvailable();
  if (!available) {
    throw new Error(
      'hwp5txt not installed — HWP 5.x binary skipped (use HWPX/PDF or Playwright worker)'
    );
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), 'hwp-'));
  const tempFile = path.join(tempDir, 'input.hwp');

  try {
    await writeFile(tempFile, buffer);
    const text = await runHwp5txt(tempFile);
    return {
      parser: 'hwp5txt',
      charCount: text.length,
      text,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function runHwp5txt(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(HWP5TXT_BIN, [filePath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const chunks: Buffer[] = [];

    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`hwp5txt timeout after ${HWP5TXT_TIMEOUT_MS}ms`));
    }, HWP5TXT_TIMEOUT_MS);

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      stdout = Buffer.concat(chunks).toString('utf-8');
      if (code !== 0) {
        reject(new Error(`hwp5txt exit ${code}: ${stderr.trim()}`));
        return;
      }
      resolve(stdout);
    });
  });
}
