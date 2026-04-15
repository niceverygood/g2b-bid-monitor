/**
 * HWP 5.x → 텍스트 추출 (hwp5txt CLI 래퍼)
 *
 * Docker 이미지에서 pyhwp 가 사전 설치되므로 HWP5TXT_BIN 은 기본값 'hwp5txt'.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const HWP5TXT_BIN = process.env.HWP5TXT_BIN ?? 'hwp5txt';
const TIMEOUT_MS = 30_000;

export async function hwp5txt(buffer: Buffer): Promise<string> {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'hwp-'));
  const tempFile = path.join(tempDir, 'input.hwp');
  try {
    await writeFile(tempFile, buffer);
    return await run(tempFile);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function run(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(HWP5TXT_BIN, [file], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const chunks: Buffer[] = [];
    let stderr = '';
    proc.stdout.on('data', (c: Buffer) => chunks.push(c));
    proc.stderr.on('data', (c: Buffer) => {
      stderr += c.toString('utf-8');
    });
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`hwp5txt timeout ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);
    proc.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0)
        reject(new Error(`hwp5txt exit ${code}: ${stderr.trim()}`));
      else resolve(Buffer.concat(chunks).toString('utf-8'));
    });
  });
}
