import { describe, expect, it } from "vitest";
import {
  normalizeGroupNameWithDefaultEmoji,
  resolveProxyGroupModuleName,
  splitLeadingEmoji,
} from "./proxy-group-name";

describe("proxy group name helpers", () => {
  it("splits emoji prefixes without treating ordinary words as emojis", () => {
    expect(splitLeadingEmoji("🚀 Node Select")).toEqual({
      emoji: "🚀",
      hasEmojiPrefix: true,
      label: "Node Select",
    });
    expect(splitLeadingEmoji("Node Select")).toEqual({
      emoji: "",
      hasEmojiPrefix: false,
      label: "Node Select",
    });
    expect(splitLeadingEmoji("🚀")).toEqual({
      emoji: "",
      hasEmojiPrefix: false,
      label: "🚀",
    });
    expect(splitLeadingEmoji("A Select")).toMatchObject({ hasEmojiPrefix: false });
    expect(splitLeadingEmoji("国内 服务")).toMatchObject({ hasEmojiPrefix: false });
  });

  it("applies default emoji only when overrides do not already include one", () => {
    const groupModule = { emoji: "⚡", name: "⚡ 自动选择" };
    expect(resolveProxyGroupModuleName(groupModule)).toBe("⚡ 自动选择");
    expect(resolveProxyGroupModuleName(groupModule, " Auto ")).toBe("⚡ Auto");
    expect(resolveProxyGroupModuleName(groupModule, "🚀 Custom")).toBe("🚀 Custom");
    expect(resolveProxyGroupModuleName(groupModule, " ")).toBe("⚡ 自动选择");

    expect(normalizeGroupNameWithDefaultEmoji("", "")).toEqual({ full: "", emoji: "🧩" });
    expect(normalizeGroupNameWithDefaultEmoji("Media", "🎬")).toEqual({ full: "🎬 Media", emoji: "🎬" });
    expect(normalizeGroupNameWithDefaultEmoji("🎬 Media", "M")).toEqual({ full: "🎬 Media", emoji: "🎬" });
  });
});
