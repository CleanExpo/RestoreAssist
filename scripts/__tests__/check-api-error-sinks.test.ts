// RA-8348: the API error sink guard must read code as syntax, not text, so a
// string or comment cannot hide a sink and a boolean use is not reported.
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM script without type declarations
import { findSinks } from "../check-api-error-sinks.mjs";

const kinds = (src: string) => findSinks(src, "x.tsx").map((f: { kind: string }) => f.kind);

describe("check-api-error-sinks guard", () => {
  describe("reports a raw <ident>.error reaching a string sink", () => {
    it.each([
      ["new Error(body.error)", "new Error("],
      ["setError(data.error)", "setError("],
      ["const m = `Failed: ${json.error}`", "template literal"],
      ['new Error("Request failed): " + body.error)', "new Error("],
      ["new Error(/* ) */ body.error)", "new Error("],
      ['setError(body["error"])', "setError("],
      ["setError(res.data.error ?? 'x')", "setError("],
      ["setError(ok && body.error)", "setError("],
      ["setError(flag ? body.error : 'x')", "setError("],
      ["setState((p) => ({ ...p, message: body.error }))", "setState("],
      ["setError(String(body.error))", "setError("],
      // A safe operation outside the sink does not undo what the sink received.
      ["void setError(body.error)", "setError("],
      ["Boolean(setError(body.error))", "setError("],
      ["if (setError(body.error)) {}", "setError("],
      ["!new Error(body.error)", "new Error("],
      // Wrappers that do not change the value are transparent, on the callee and on the read.
      ["(setError)(body.error)", "setError("],
      ["(setError!)(body.error)", "setError("],
      ["props.setError(body.error)", "setError("],
      ["this.setError(body.error)", "setError("],
      ["setError?.(body.error)", "setError("],
      ["new (Error)(body.error)", "new Error("],
      ["new globalThis.Error(body.error)", "new Error("],
      ["setError((body.error as string))", "setError("],
      ["setError(body.error satisfies unknown)", "setError("],
      ["setError((body.error)!)", "setError("],
      // A member name is read by one rule for the read and for the callee: x.name and x["name"].
      ['props["setError"](body.error)', "setError("],
      ['props?.["setError"](body.error)', "setError("],
      ["props[`setError`](body.error)", "setError("],
      ['new globalThis["Error"](body.error)', "new Error("],
      // A comma expression's value is its last operand.
      ["(0, setError)(body.error)", "setError("],
      ["(0, props.setError)(body.error)", "setError("],
      // Calling Error without `new` builds the same Error.
      ["Error(body.error)", "new Error("],
      ['globalThis["Error"](body.error)', "new Error("],
      // A key fixed in the syntax is one string however it is written.
      ['props[("setError")](body.error)', "setError("],
      ['props[("setError" satisfies string)](body.error)', "setError("],
      ['props["set" + "Error"](body.error)', "setError("],
      ['setError(body["error" as const])', "setError("],
      ["setError(body[`err${'or'}`])", "setError("],
      ['setError(body[(0, "error")])', "setError("],
      ['new globalThis["Error" as const](body.error)', "new Error("],
    ])("%s", (src, kind) => {
      expect(kinds(src)).toEqual([kind]);
    });
  });

  describe("does not report safe reads", () => {
    it.each([
      "setError(apiErrorMessage(body) ?? 'x')",
      "new Error(apiErrorMessage(body.error) ?? 'x')",
      "setHasError(Boolean(body.error))",
      "setHasError(!!body.error)",
      "setFailed(typeof body.error === 'string')",
      "setFailed(body.error !== undefined)",
      "setMsg(body.error ? 'Save failed' : null)",
      "setMsg(body.error && 'Save failed')",
      "new Error(data.error.message)",
      "console.error(body.error)",
      "setError(toast.error)",
      "const s = 'setError(body.error)'",
      "// setError(body.error)",
      "setItems((p) => p.filter((i) => i.id !== body.error))",
      "setMsg(() => { if (body.error) return 'failed'; return null; })",
      "setError((apiErrorMessage)(body.error) ?? 'x')",
      "setHasError((Boolean)(body.error))",
      "setError((body.error as { message: string }).message)",
      "setError((body.error satisfies unknown as { message: string })!.message)",
      'setError(body["error"]["message"])',
      "setError((0, apiErrorMessage)(body.error) ?? 'x')",
      'setError(body[("error" as const)]["message"])',
      "setError(body[key])",
    ])("%s", (src) => {
      expect(kinds(src)).toEqual([]);
    });
  });

  it("reports the line of the read", () => {
    const f = findSinks("const a = 1;\n\nsetError(\n  body.error,\n);", "x.ts");
    expect(f).toHaveLength(1);
    expect(f[0].line).toBe(4);
    expect(f[0].text).toBe("body.error");
  });

  it("treats an angle-bracket type assertion in .ts as transparent", () => {
    expect(findSinks("setError(<string>body.error);", "x.ts").map((f: { kind: string }) => f.kind)).toEqual(["setError("]);
    expect(findSinks("setError((<{ message: string }>body.error).message);", "x.ts")).toEqual([]);
  });

  it("parses .ts generics that a .tsx parse would misread", () => {
    expect(kinds("const f = <T,>(x: T) => x;\nsetError(body.error);")).toEqual(["setError("]);
    expect(findSinks("const g = <T>(x: T) => x;\nsetError(body.error);", "x.ts").map((f: { kind: string }) => f.kind)).toEqual(["setError("]);
  });
});
