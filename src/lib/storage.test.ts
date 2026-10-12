import { describe, expect, it } from "vitest";
import { defaultSettings, normalizeReaderSettings } from "./storage";

describe("阅读设置迁移", () => {
  it("只保留当前支持的设置并丢弃旧版本字段", () => {
    const settings = normalizeReaderSettings({
      ...defaultSettings,
      rate: 1.25,
      removedEngine: "legacy",
      obsoleteEndpoint: "http://127.0.0.1:8000",
    });

    expect(settings).toEqual({
      ...defaultSettings,
      rate: 1.25,
    });
  });

  it("修正越界数值和无效枚举", () => {
    expect(
      normalizeReaderSettings({
        fontSize: 99,
        lineHeight: 0,
        contentWidth: 1200,
        rate: 9,
        theme: "unknown",
        fontFamily: "unknown",
        speechStyle: "unknown",
      }),
    ).toEqual({
      ...defaultSettings,
      fontSize: 29,
      lineHeight: 1.45,
      contentWidth: 880,
      rate: 2,
    });
  });
});
