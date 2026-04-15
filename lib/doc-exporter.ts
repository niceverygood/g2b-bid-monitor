import { Document, Packer, Paragraph, HeadingLevel, TextRun, AlignmentType } from 'docx';
import JSZip from 'jszip';

/**
 * Convert markdown (produced by proposal-generator) to a .docx Buffer.
 * Handles: # / ## / ### headings, - / * bullets, 1. numbered lists, paragraphs.
 * Not handled: inline bold/italic, tables, images — good enough for v1.
 */
export async function markdownToDocx(markdown: string, title: string): Promise<Buffer> {
  const lines = markdown.split(/\r?\n/);
  const children: Paragraph[] = [];

  // Cover title
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 400 },
      children: [new TextRun({ text: title, bold: true, size: 36 })],
    })
  );

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      children.push(new Paragraph({ children: [] }));
      continue;
    }

    const h1 = line.match(/^#\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);
    const h3 = line.match(/^###\s+(.*)$/);
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+\.\s+(.*)$/);

    if (h1) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 300, after: 150 },
          children: [new TextRun({ text: h1[1], bold: true, size: 30 })],
        })
      );
    } else if (h2) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 120 },
          children: [new TextRun({ text: h2[1], bold: true, size: 26 })],
        })
      );
    } else if (h3) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 100 },
          children: [new TextRun({ text: h3[1], bold: true, size: 22 })],
        })
      );
    } else if (bullet) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [new TextRun({ text: bullet[1], size: 22 })],
        })
      );
    } else if (numbered) {
      children.push(
        new Paragraph({
          numbering: { reference: 'default-numbering', level: 0 },
          children: [new TextRun({ text: numbered[1], size: 22 })],
        })
      );
    } else {
      children.push(
        new Paragraph({
          spacing: { after: 120 },
          children: [new TextRun({ text: line, size: 22 })],
        })
      );
    }
  }

  const doc = new Document({
    creator: '바틀 입찰 모니터',
    title,
    styles: {
      default: {
        document: { run: { font: 'Malgun Gothic', size: 22 } },
      },
    },
    numbering: {
      config: [
        {
          reference: 'default-numbering',
          levels: [
            {
              level: 0,
              format: 'decimal',
              text: '%1.',
              alignment: AlignmentType.START,
            },
          ],
        },
      ],
    },
    sections: [{ children }],
  });

  return Packer.toBuffer(doc) as unknown as Buffer;
}

/**
 * Bundle multiple files (already Buffers) into a single .zip Buffer.
 */
export async function bundleZip(files: { name: string; content: Buffer }[]): Promise<Buffer> {
  const zip = new JSZip();
  for (const f of files) {
    zip.file(f.name, f.content);
  }
  return (await zip.generateAsync({ type: 'nodebuffer' })) as Buffer;
}

/**
 * Safe-ish filename for Korean document names.
 * Keeps Hangul, removes problematic characters.
 */
export function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
}
