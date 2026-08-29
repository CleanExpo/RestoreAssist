import { describe, expect, it } from "vitest";
import {
  byPriority,
  formatLine,
  sanitise,
  toIssueInput,
  type IssueNode,
} from "../linear-query";

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);

/** Builds an issue node; every field is overridable so a test can poison one. */
function issue(overrides: Partial<IssueNode> = {}): IssueNode {
  return {
    identifier: "RA-1",
    title: "A plain title",
    description: "body",
    priority: 3,
    state: { name: "Todo" },
    team: { key: "RA" },
    project: null,
    labels: { nodes: [] },
    ...overrides,
  };
}

describe("sanitise", () => {
  it("removes C0 control characters, including ESC and BEL", () => {
    expect(sanitise(`a${ESC}b${BEL}c`)).toBe("abc");
  });

  it("removes C1 control characters, including the single-byte OSC introducer", () => {
    // U+009D is OSC on its own — stripping ESC alone would not catch it.
    expect(sanitise(`a${String.fromCharCode(0x9d)}b`)).toBe("ab");
  });

  it("leaves ordinary text and non-ASCII punctuation untouched", () => {
    const text = "Deny-list covers argument injection — but not secrets (RA-7260)";
    expect(sanitise(text)).toBe(text);
  });
});

describe("formatLine", () => {
  it("emits no ANSI escape sequence when the title carries one", () => {
    // Erase-line + cursor-home repaints the row, so the listing would show a
    // fabricated identifier and priority in place of the real ones.
    const line = formatLine(
      issue({ title: `Looks harmless${ESC}[2K${ESC}[1GRA-0000: [None] all clear` }),
    );
    expect(line).not.toContain(ESC);
    expect(line).toMatch(/^RA-1: \[Medium\] /);
  });

  it("emits no OSC sequence when the title carries a hyperlink escape", () => {
    const line = formatLine(
      issue({ title: `click${ESC}]8;;https://example.invalid${BEL}here` }),
    );
    expect(line).not.toContain(ESC);
    expect(line).not.toContain(BEL);
  });

  it("sanitises label and state names, not just the title", () => {
    const line = formatLine(
      issue({
        state: { name: `Todo${ESC}[31m` },
        labels: { nodes: [{ name: `bug${ESC}[5m` }, { name: "owner-gated" }] },
      }),
    );
    expect(line).not.toContain(ESC);
    expect(line).toContain("owner-gated");
  });

  it("renders a clean issue readably", () => {
    expect(formatLine(issue({ priority: 1, labels: { nodes: [{ name: "bug" }] } }))).toBe(
      "RA-1: [Urgent] A plain title - Todo [bug]",
    );
  });
});

describe("byPriority", () => {
  it("ranks urgent first and unset (0) last", () => {
    const order = [
      issue({ identifier: "none", priority: 0 }),
      issue({ identifier: "low", priority: 4 }),
      issue({ identifier: "urgent", priority: 1 }),
    ]
      .sort(byPriority)
      .map((n) => n.identifier);
    expect(order).toEqual(["urgent", "low", "none"]);
  });
});

describe("toIssueInput", () => {
  it("maps a null description to an empty string and omits an absent project", () => {
    const input = toIssueInput(issue({ description: null, project: null }));
    expect(input.description).toBe("");
    expect(input).not.toHaveProperty("project");
  });

  it("carries labels through verbatim — the owner-gate depends on exact names", () => {
    const input = toIssueInput(
      issue({ labels: { nodes: [{ name: "owner-gated" }, { name: "security" }] } }),
    );
    expect(input.labels).toEqual(["owner-gated", "security"]);
  });
});
