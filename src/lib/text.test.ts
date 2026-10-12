import { describe, expect, it } from "vitest";
import {
  calculateBookProgress,
  parseTxtChapters,
  splitIntoParagraphs,
} from "./text";

describe("文本解析", () => {
  it("能识别常见中文章节标题", () => {
    const chapters = parseTxtChapters(
      "前言内容\n\n第一章 出发\n\n清晨，我们离开了城里。\n\n第二章 山路\n\n雨落下来。",
    );

    expect(chapters).toHaveLength(3);
    expect(chapters[1].title).toBe("第一章 出发");
    expect(chapters[2].content).toContain("雨落下来");
  });

  it("没有章节标题时会保留正文", () => {
    const chapters = parseTxtChapters("第一段。\n\n第二段。");
    expect(chapters).toHaveLength(1);
    expect(chapters[0].content).toContain("第二段");
  });

  it("会拆分过长的朗读段落", () => {
    const paragraph = "这是一个句子。".repeat(100);
    const parts = splitIntoParagraphs(paragraph);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => part.length <= 420)).toBe(true);
  });

  it("能计算整本书进度", () => {
    const chapters = parseTxtChapters(
      "第一章\n\n一。\n\n第二章\n\n二。\n\n第三章\n\n三。\n\n第四章\n\n四。",
    );
    expect(calculateBookProgress(chapters, 1, 0.5)).toBe(38);
  });
});
