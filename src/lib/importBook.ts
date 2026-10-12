import JSZip from "jszip";
import type { Book, Chapter } from "../types";
import { normalizeText, parseTxtChapters } from "./text";

const coverColors = [
  "#a74732",
  "#2f6959",
  "#395d79",
  "#8a6b33",
  "#655680",
  "#5e6255",
];

function createBook(
  file: File,
  title: string,
  author: string,
  chapters: Chapter[],
  coverImage?: string,
): Book {
  const now = Date.now();
  const id = `${now}-${Math.random().toString(36).slice(2, 9)}`;

  return {
    id,
    title: title.trim() || file.name.replace(/\.[^.]+$/, ""),
    author: author.trim() || "未知作者",
    format: file.name.toLowerCase().endsWith(".epub") ? "epub" : "txt",
    coverColor: coverColors[Math.floor(Math.random() * coverColors.length)],
    coverImage,
    createdAt: now,
    updatedAt: now,
    chapters,
    progress: {
      chapterIndex: 0,
      paragraphIndex: 0,
      scrollRatio: 0,
      updatedAt: now,
    },
  };
}

function decodeText(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const replacementRate =
    (utf8.match(/\uFFFD/g)?.length ?? 0) / Math.max(utf8.length, 1);

  if (replacementRate < 0.01) return utf8;

  try {
    return new TextDecoder("gb18030").decode(buffer);
  } catch {
    return utf8;
  }
}

function resolvePath(basePath: string, relativePath: string): string {
  const sanitized = relativePath.split("#")[0].split("?")[0];
  const parts = `${basePath}/${sanitized}`.split("/");
  const resolved: string[] = [];

  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }

  return resolved.join("/");
}

function xmlText(
  root: ParentNode,
  selectors: string[],
  fallback = "",
): string {
  for (const selector of selectors) {
    const value = root.querySelector(selector)?.textContent?.trim();
    if (value) return value;
  }
  return fallback;
}

function htmlToText(html: string): string {
  const documentNode = new DOMParser().parseFromString(html, "text/html");
  documentNode
    .querySelectorAll("script, style, nav, svg")
    .forEach((element) => element.remove());

  documentNode.querySelectorAll("br").forEach((element) => {
    element.replaceWith("\n");
  });
  documentNode
    .querySelectorAll("p, div, section, article, h1, h2, h3, h4, li, blockquote")
    .forEach((element) => {
      element.insertAdjacentText("afterend", "\n\n");
    });

  return normalizeText(documentNode.body.textContent ?? "");
}

function titleFromHtml(html: string, fallback: string): string {
  const documentNode = new DOMParser().parseFromString(html, "text/html");
  return (
    documentNode.querySelector("h1, h2, h3, title")?.textContent?.trim() ||
    fallback
  );
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function importEpub(file: File): Promise<Book> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const containerFile = zip.file("META-INF/container.xml");
  if (!containerFile) throw new Error("EPUB 缺少容器描述文件");

  const containerXml = new DOMParser().parseFromString(
    await containerFile.async("text"),
    "application/xml",
  );
  const packagePath =
    containerXml.querySelector("rootfile")?.getAttribute("full-path") ?? "";
  const packageFile = zip.file(packagePath);
  if (!packagePath || !packageFile) throw new Error("无法读取 EPUB 内容清单");

  const packageXml = new DOMParser().parseFromString(
    await packageFile.async("text"),
    "application/xml",
  );
  const packageDirectory = packagePath.split("/").slice(0, -1).join("/");
  const title = xmlText(
    packageXml,
    ["metadata > title", "metadata > dc\\:title", "dc\\:title"],
    file.name.replace(/\.epub$/i, ""),
  );
  const author = xmlText(
    packageXml,
    ["metadata > creator", "metadata > dc\\:creator", "dc\\:creator"],
    "未知作者",
  );

  const manifest = new Map<string, { href: string; mediaType: string }>();
  packageXml.querySelectorAll("manifest > item").forEach((item) => {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (id && href) {
      manifest.set(id, {
        href,
        mediaType: item.getAttribute("media-type") ?? "",
      });
    }
  });

  const chapters: Chapter[] = [];
  const spineItems = Array.from(packageXml.querySelectorAll("spine > itemref"));

  for (const [index, item] of spineItems.entries()) {
    const reference = item.getAttribute("idref") ?? "";
    const manifestItem = manifest.get(reference);
    if (!manifestItem) continue;

    const chapterPath = resolvePath(packageDirectory, manifestItem.href);
    const chapterFile = zip.file(chapterPath);
    if (!chapterFile) continue;

    const html = await chapterFile.async("text");
    const content = htmlToText(html);
    if (!content || content.length < 2) continue;

    chapters.push({
      id: `epub-chapter-${index + 1}`,
      title: titleFromHtml(html, `第 ${chapters.length + 1} 章`),
      content,
    });
  }

  if (!chapters.length) throw new Error("EPUB 中没有可阅读的正文");

  const coverId =
    packageXml
      .querySelector('metadata > meta[name="cover"]')
      ?.getAttribute("content") ??
    packageXml
      .querySelector('manifest > item[properties~="cover-image"]')
      ?.getAttribute("id") ??
    "";
  const coverItem = manifest.get(coverId);
  let coverImage: string | undefined;

  if (coverItem) {
    const coverPath = resolvePath(packageDirectory, coverItem.href);
    const coverFile = zip.file(coverPath);
    if (coverFile) {
      coverImage = await blobToDataUrl(
        await coverFile.async("blob").then(
          (blob) =>
            new Blob([blob], {
              type: coverItem.mediaType || blob.type || "image/jpeg",
            }),
        ),
      );
    }
  }

  return createBook(file, title, author, chapters, coverImage);
}

async function importTxt(file: File): Promise<Book> {
  const text = decodeText(await file.arrayBuffer());
  const chapters = parseTxtChapters(text);
  if (!chapters.length) throw new Error("文件中没有可阅读的正文");

  return createBook(
    file,
    file.name.replace(/\.txt$/i, ""),
    "未知作者",
    chapters,
  );
}

export async function importBookFile(file: File): Promise<Book> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "epub") return importEpub(file);
  if (extension === "txt") return importTxt(file);
  throw new Error("暂时只支持 TXT 和 EPUB 文件");
}
