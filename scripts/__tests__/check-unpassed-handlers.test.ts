import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findUnpassedHandlers, selfTest } from "../check-unpassed-handlers.mjs";

const roots: string[] = [];
function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "ra8609-test-"));
  roots.push(root);
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}
const names = (root: string) =>
  (findUnpassedHandlers(root) as { name: string }[]).map((f) => f.name);

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("check-unpassed-handlers (RA-8609)", () => {
  it("self-test plants an unpassed handler and sees it", () => {
    expect(selfTest()).toEqual({ ok: true, found: ["onPlantedChange"] });
  });

  it("reports a room-panel handler that only a test passes (the Opacity slider shape)", () => {
    const root = tree({
      "components/sketch/Panel.tsx":
        "interface P {\n  onColorChange?: () => void;\n  onOpacityChange?: (id: string, o: number) => void;\n}\n",
      "components/sketch/Editor.tsx": "<Panel onColorChange={setColour} />\n",
      "components/sketch/__tests__/Panel.test.tsx":
        "<Panel onOpacityChange={vi.fn()} />\n",
    });
    expect(names(root)).toEqual(["onOpacityChange"]);
  });

  it("passes once a screen mounts the handler", () => {
    const root = tree({
      "components/sketch/Panel.tsx":
        "interface P {\n  onOpacityChange?: (o: number) => void;\n}\n",
      "app/dashboard/page.tsx": "<Panel\n  onOpacityChange={setOpacity}\n/>\n",
    });
    expect(names(root)).toEqual([]);
  });

  it("ignores the vendored kits only, by path", () => {
    const root = tree({
      "components/ui/slider.tsx":
        "interface P {\n  onKitChange?: () => void;\n}\n",
      "components/ai-elements/prompt.tsx":
        "interface P {\n  onAiChange?: () => void;\n}\n",
      "components/uikit/thing.tsx":
        "interface P {\n  onLookalikeChange?: () => void;\n}\n",
    });
    expect(names(root)).toEqual(["onLookalikeChange"]);
  });

  it("does not count a longer name that ends with the handler name", () => {
    const root = tree({
      "components/a/A.tsx": "interface P {\n  onChange?: () => void;\n}\n",
      "components/b/B.tsx": "<Input onChangeCapture={x} data-onChange={y} />\n",
    });
    expect(names(root)).toEqual(["onChange"]);
  });
});
