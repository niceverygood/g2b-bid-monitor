/**
 * HWPX 파서 — zip + XML 직접 파싱
 *
 * HWPX 구조 (OOXML 유사):
 *   Contents/
 *     content.hpf       — 섹션 목록 매니페스트
 *     section0.xml      — 본문 텍스트 (여러 섹션)
 *     section1.xml
 *     header.xml        — 스타일/헤더
 *   META-INF/
 *   mimetype            — "application/hwp+zip"
 *
 * 본문 텍스트는 <hp:t> 엘리먼트 안에 들어있다.
 * 외부 프로세스 없이 jszip + fast-xml-parser로 순수 JS 추출 — 가장 빠름.
 */

import type { ParseResult } from './index';

export async function parseHwpx(buffer: Buffer): Promise<ParseResult> {
  const { default: JSZip } = await import('jszip');
  const { XMLParser } = await import('fast-xml-parser');

  const zip = await JSZip.loadAsync(buffer);
  const warnings: string[] = [];

  // section*.xml 파일들을 순서대로 수집
  const sectionFiles = Object.keys(zip.files)
    .filter((name) => /^Contents\/section\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = Number(a.match(/section(\d+)/)?.[1] ?? 0);
      const nb = Number(b.match(/section(\d+)/)?.[1] ?? 0);
      return na - nb;
    });

  if (sectionFiles.length === 0) {
    warnings.push('no section*.xml found in HWPX');
  }

  const parser = new XMLParser({
    ignoreAttributes: true,
    preserveOrder: false,
    textNodeName: '#text',
    // hp:t, hp:p 등 namespace prefix 유지
    removeNSPrefix: true,
  });

  const allText: string[] = [];

  for (const name of sectionFiles) {
    const xml = await zip.files[name].async('string');
    try {
      const json = parser.parse(xml);
      collectText(json, allText);
    } catch (err) {
      warnings.push(`${name}: ${(err as Error).message}`);
    }
  }

  const text = allText.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  return {
    parser: 'hwpx-xml',
    charCount: text.length,
    text,
    warnings: warnings.length ? warnings : undefined,
  };
}

/**
 * 재귀적으로 파싱된 XML 객체에서 <t> (text run) 노드들만 모은다.
 * HWPX에서 문단 구분은 <p> 요소 → 문단 경계에 개행 삽입.
 */
function collectText(node: unknown, out: string[], inParagraph = false): void {
  if (node == null) return;

  if (typeof node === 'string') {
    if (node.trim()) out.push(node);
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) collectText(item, out, inParagraph);
    return;
  }

  if (typeof node !== 'object') return;

  const obj = node as Record<string, unknown>;

  // <t> 요소: 텍스트 런. 값은 문자열 또는 {#text: ...}
  if ('t' in obj) {
    const t = obj.t;
    if (typeof t === 'string') {
      if (t.trim()) out.push(t);
    } else if (Array.isArray(t)) {
      for (const item of t) {
        if (typeof item === 'string') {
          if (item.trim()) out.push(item);
        } else if (item && typeof item === 'object' && '#text' in item) {
          const txt = String((item as any)['#text'] ?? '');
          if (txt.trim()) out.push(txt);
        }
      }
    } else if (t && typeof t === 'object' && '#text' in (t as any)) {
      const txt = String((t as any)['#text'] ?? '');
      if (txt.trim()) out.push(txt);
    }
  }

  // 나머지 자식 순회 + 문단 경계 처리
  for (const [key, val] of Object.entries(obj)) {
    if (key === 't' || key === '#text') continue;
    const isPara = key === 'p';
    collectText(val, out, isPara);
    if (isPara) out.push('\n');
  }
}
