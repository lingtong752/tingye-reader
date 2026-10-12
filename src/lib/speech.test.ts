import { describe, expect, it } from "vitest";
import {
  splitIntoSpeechSegments,
  speechStyleProfiles,
} from "./speech";

describe("自然朗读分句", () => {
  it("按中文标点拆分，并保留标点", () => {
    const segments = splitIntoSpeechSegments(
      "她停下来，问道：“你真的要走吗？”风没有回答。",
      "natural",
    );

    expect(segments.length).toBeGreaterThan(2);
    expect(segments.map((segment) => segment.text).join("")).toBe(
      "她停下来，问道：“你真的要走吗？”风没有回答。",
    );
  });

  it("问句音调更高，省略号停顿更久", () => {
    const question = splitIntoSpeechSegments("你还好吗？", "natural")[0];
    const ellipsis = splitIntoSpeechSegments("我想……也许吧。", "natural");

    expect(question.pitch).toBeGreaterThan(speechStyleProfiles.natural.pitch);
    expect(ellipsis[0].pauseMs).toBeGreaterThan(500);
  });

  it("沉浸模式比清晰模式更慢、停顿更长", () => {
    const immersive = splitIntoSpeechSegments("山里的灯亮了。", "immersive")[0];
    const clear = splitIntoSpeechSegments("山里的灯亮了。", "clear")[0];

    expect(immersive.rateScale).toBeLessThan(clear.rateScale);
    expect(immersive.pauseMs).toBeGreaterThan(clear.pauseMs);
  });

  it("对白问句会轻微提高音调并放慢语速", () => {
    const [dialogue] = splitIntoSpeechSegments(
      "“你真的要走吗？”",
      "immersive",
    );

    expect(dialogue.pitch).toBeGreaterThan(speechStyleProfiles.immersive.pitch);
    expect(dialogue.rateScale).toBeLessThan(
      speechStyleProfiles.immersive.rateScale,
    );
  });

  it("克制处理沉重旁白", () => {
    const [segment] = splitIntoSpeechSegments(
      "他叹了口气，向漫长的黑暗告别。",
      "natural",
    );

    expect(segment.pitch).toBeLessThan(speechStyleProfiles.natural.pitch);
  });
});
