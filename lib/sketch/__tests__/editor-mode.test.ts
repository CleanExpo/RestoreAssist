import { describe, expect, it } from "vitest";
import {
  coerceToolForMode,
  isToolAllowedInMode,
  QUICK_EDIT_TOOLS,
  readEditorMode,
  writeEditorMode,
  EDITOR_MODE_STORAGE_KEY,
} from "../editor-mode";

describe("editor-mode", () => {
  it("quick mode allows select, text, measure, pan only", () => {
    expect(isToolAllowedInMode("select", "quick")).toBe(true);
    expect(isToolAllowedInMode("text", "quick")).toBe(true);
    expect(isToolAllowedInMode("measure", "quick")).toBe(true);
    expect(isToolAllowedInMode("pan", "quick")).toBe(true);
    expect(isToolAllowedInMode("room", "quick")).toBe(false);
    expect(isToolAllowedInMode("door", "quick")).toBe(false);
    expect(isToolAllowedInMode("moisture", "quick")).toBe(false);
  });

  it("coerces disallowed tools to select in quick mode", () => {
    expect(coerceToolForMode("room", "quick")).toBe("select");
    expect(coerceToolForMode("measure", "quick")).toBe("measure");
    expect(coerceToolForMode("damage", "advanced")).toBe("damage");
  });

  it("advanced allows full dock set", () => {
    expect(isToolAllowedInMode("room", "advanced")).toBe(true);
    expect(isToolAllowedInMode("moisture", "advanced")).toBe(true);
    expect(isToolAllowedInMode("equipment", "advanced")).toBe(true);
  });

  it("QUICK_EDIT_TOOLS excludes CAD tools", () => {
    expect(QUICK_EDIT_TOOLS.has("select")).toBe(true);
    expect(QUICK_EDIT_TOOLS.has("room")).toBe(false);
  });

  it("persists mode via storage helpers", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };
    expect(readEditorMode(storage)).toBe("advanced");
    writeEditorMode("quick", storage);
    expect(store.get(EDITOR_MODE_STORAGE_KEY)).toBe("quick");
    expect(readEditorMode(storage)).toBe("quick");
  });
});
