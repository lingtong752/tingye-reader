import type { Chapter } from "../types";

const chapterHeading =
  /^\s*(第[〇零一二三四五六七八九十百千万两0-9]+[章节回卷部篇]|Chapter\s+[0-9IVXLCDM]+|序章|楔子|引子|前言|后记|尾声)(?:\s+.*)?$/i;

export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function splitIntoParagraphs(text: string): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const blocks = normalized
    .split(/\n\s*\n/)
    .flatMap((block) => block.split(/\n(?=\s{0,2}[\u4e00-\u9fff“「『])/))
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.flatMap((block) => {
    if (block.length <= 420) return [block];

    const sentences = block.match(/[^。！？!?；;]+[。！？!?；;]?/g) ?? [block];
    const chunks: string[] = [];
    let current = "";

    for (const sentence of sentences) {
      if (current && current.length + sentence.length > 360) {
        chunks.push(current.trim());
        current = sentence;
      } else {
        current += sentence;
      }
    }

    if (current.trim()) chunks.push(current.trim());
    return chunks;
  });
}

export function parseTxtChapters(text: string): Chapter[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const lines = normalized.split("\n");
  const headingIndexes = lines
    .map((line, index) => (chapterHeading.test(line.trim()) ? index : -1))
    .filter((index) => index >= 0);

  if (headingIndexes.length > 0) {
    const chapters: Chapter[] = [];
    const firstHeading = headingIndexes[0];

    if (firstHeading > 0) {
      const preface = lines.slice(0, firstHeading).join("\n").trim();
      if (preface) {
        chapters.push({
          id: "chapter-preface",
          title: "卷首",
          content: preface,
        });
      }
    }

    headingIndexes.forEach((lineIndex, chapterIndex) => {
      const nextHeading = headingIndexes[chapterIndex + 1] ?? lines.length;
      const title = lines[lineIndex].trim();
      const content = lines
        .slice(lineIndex + 1, nextHeading)
        .join("\n")
        .trim();

      if (content) {
        chapters.push({
          id: `chapter-${chapterIndex + 1}`,
          title,
          content,
        });
      }
    });

    if (chapters.length) return chapters;
  }

  const paragraphs = normalized.split(/\n\s*\n/).filter(Boolean);
  const chapters: Chapter[] = [];
  let buffer: string[] = [];
  let size = 0;

  const flush = () => {
    if (!buffer.length) return;
    const index = chapters.length + 1;
    chapters.push({
      id: `section-${index}`,
      title: paragraphs.length > 18 ? `第 ${index} 节` : "正文",
      content: buffer.join("\n\n"),
    });
    buffer = [];
    size = 0;
  };

  for (const paragraph of paragraphs) {
    if (size > 9000 && buffer.length) flush();
    buffer.push(paragraph.trim());
    size += paragraph.length;
  }
  flush();

  return chapters;
}

export function calculateBookProgress(
  chapters: Chapter[],
  chapterIndex: number,
  scrollRatio: number,
): number {
  if (!chapters.length) return 0;
  const completed = Math.max(0, Math.min(chapterIndex, chapters.length - 1));
  const withinChapter = Math.max(0, Math.min(scrollRatio, 1));
  return Math.round(((completed + withinChapter) / chapters.length) * 100);
}
