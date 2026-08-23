// @vitest-environment jsdom
//
// NOTE (2026-08-23): this file cannot execute on `origin/main` today, and
// neither can any of the twelve existing React component suites. The pnpm→npm
// switch dropped `@testing-library/dom` — a peer of @testing-library/react v16
// that pnpm resolved implicitly and npm does not — so `render` fails to import
// before a single test runs (`npm ls @testing-library/dom` → empty). Restoring
// that peer belongs to the in-flight CI-alignment PR, not here; deliberately
// NOT duplicated into this diff, because both changes touch package-lock.json.
// The moment the peer returns, this coverage activates unchanged.
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import OpenRouterModelField, {
  OPENROUTER_DEFAULT_MODEL,
  MAX_MODEL_SLUG_LENGTH,
} from "../OpenRouterModelField";

const CATALOGUE = {
  recommended: [
    { id: "deepseek/deepseek-chat", name: "DeepSeek Chat", family: "deepseek", contextLength: 64000 },
  ],
  models: [
    { id: "deepseek/deepseek-chat", name: "DeepSeek Chat", family: "deepseek", contextLength: 64000 },
    { id: "qwen/qwen3-235b", name: "Qwen3 235B", family: "qwen", contextLength: 128000 },
  ],
  unavailable: false,
};

/**
 * Wait until the catalogue request has SETTLED.
 *
 * Without this, `waitFor(() => expect(getByLabelText(/model/i).tagName).toBe("INPUT"))`
 * is vacuous: the loading placeholder is itself an <input> bound to the same
 * label, so the assertion passes on the very first tick and the test proves
 * nothing about the degradation path. (Proven: a mutant that ignored the
 * server's `unavailable` flag survived until this existed.)
 */
async function settle() {
  await waitFor(() => {
    expect(
      screen.queryByText(/Loading the current model list/i),
    ).not.toBeInTheDocument();
  });
}

function renderField(onChange = vi.fn(), value = "") {
  render(
    <OpenRouterModelField fieldId="test-model" value={value} onChange={onChange} />,
  );
  return onChange;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("OpenRouterModelField", () => {
  it("renders the live catalogue as a picker once it loads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => CATALOGUE }) as never,
    );
    renderField();

    // waitFor, not findBy: findBy resolves on the FIRST match, and the disabled
    // loading input matches the same label before the catalogue lands.
    await waitFor(() => {
      expect(screen.getByLabelText(/model/i).tagName).toBe("SELECT");
    });
    expect(
      screen.getByRole("option", { name: `Use the default (${OPENROUTER_DEFAULT_MODEL})` }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "DeepSeek Chat" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "qwen/qwen3-235b" })).toBeInTheDocument();
  });

  it("reports the chosen slug to its parent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => CATALOGUE }) as never,
    );
    const onChange = renderField();

    await waitFor(() => {
      expect(screen.getByLabelText(/model/i).tagName).toBe("SELECT");
    });
    fireEvent.change(screen.getByLabelText(/model/i), {
      target: { value: "qwen/qwen3-235b" },
    });
    expect(onChange).toHaveBeenCalledWith("qwen/qwen3-235b");
  });

  it.each([
    ["a non-OK response", { ok: false, json: async () => ({}) }],
    ["an explicit unavailable payload", { ok: true, json: async () => ({ recommended: [], models: [], unavailable: true }) }],
  ])("degrades to a free-text slug field on %s", async (_label, response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response) as never);
    renderField();

    await settle();
    expect(screen.getByLabelText(/model/i).tagName).toBe("INPUT");
    expect(screen.getByLabelText(/model/i)).toHaveAttribute(
      "placeholder",
      OPENROUTER_DEFAULT_MODEL,
    );
    expect(
      screen.getByText(/couldn't reach OpenRouter's model list/i),
    ).toBeInTheDocument();
  });

  it.each([
    ["an empty object", {}],
    ["a null body", null],
    ["a JSON string", "not a catalogue"],
    ["arrays missing entirely", { unavailable: false }],
    ["models present but not an array", { recommended: [], models: "nope" }],
    ["a catalogue with no usable models", { recommended: [], models: [], unavailable: false }],
    ["entries with no string id", { recommended: [], models: [{ name: "x" }, { id: 7 }] }],
  ])("degrades to free text on a 200 carrying %s", async (_label, body) => {
    // res.ok says nothing about the payload. `{}` has an ABSENT `unavailable`,
    // not a true one — trusting it would mark the catalogue available and then
    // crash on `.recommended.length` / `.models.map`.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => body }) as never,
    );
    renderField();

    await settle();
    expect(screen.getByLabelText(/model/i).tagName).toBe("INPUT");
    expect(
      screen.getByText(/couldn't reach OpenRouter's model list/i),
    ).toBeInTheDocument();
  });

  it("honours an explicit unavailable flag even when models are present", async () => {
    // The route sets `unavailable` on an upstream failure. It must win over the
    // payload's own contents — inferring availability from a non-empty array
    // would render a picker built from a body the server told us not to trust.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ...CATALOGUE, unavailable: true }),
      }) as never,
    );
    renderField();

    await settle();
    expect(screen.getByLabelText(/model/i).tagName).toBe("INPUT");
    expect(
      screen.getByText(/couldn't reach OpenRouter's model list/i),
    ).toBeInTheDocument();
  });

  it("does not trust a well-formed body carried by a non-OK response", async () => {
    // A 4xx/5xx whose body still parses as a catalogue is not a catalogue. The
    // status is checked first and independently of the payload.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => CATALOGUE }) as never,
    );
    renderField();

    await settle();
    expect(screen.getByLabelText(/model/i).tagName).toBe("INPUT");
    expect(
      screen.getByText(/couldn't reach OpenRouter's model list/i),
    ).toBeInTheDocument();
  });

  it("keeps the well-formed entries when only some are malformed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          recommended: [],
          models: [
            { id: "qwen/qwen3-235b", name: "Qwen3 235B", family: "qwen", contextLength: 1 },
            { id: 7, name: "broken" },
            // Truthy `.length`, so a check that only asks "is length > 0"
            // accepts it and renders an <option> with a non-string value. The
            // id must be tested for being a STRING, not merely for having a
            // length.
            { id: ["qwen/qwen3-235b"], name: "array id" },
            { id: "", name: "empty id" },
            { id: "ok/no-name", name: 42 },
            null,
          ],
        }),
      }) as never,
    );
    renderField();

    await waitFor(() => {
      expect(screen.getByLabelText(/model/i).tagName).toBe("SELECT");
    });
    // Default + exactly one good entry. Every other row is malformed in a
    // different way and none of them may reach the DOM.
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(screen.queryByRole("option", { name: "array id" })).toBeNull();
    expect(screen.getByRole("option", { name: "qwen/qwen3-235b" })).toBeInTheDocument();
  });

  it("degrades to free text when the request rejects outright", async () => {
    // A network error must not leave the field stuck on "Loading models…" —
    // that is the one state the free-text fallback exists to prevent.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")) as never);
    renderField();

    await settle();
    expect(screen.getByLabelText(/model/i).tagName).toBe("INPUT");
    expect(screen.getByLabelText(/model/i)).not.toBeDisabled();
  });

  it("caps a pasted slug at the server's own bound", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as never);
    const onChange = renderField();

    await settle();
    expect(screen.getByLabelText(/model/i).tagName).toBe("INPUT");
    // maxLength alone is bypassed by a paste in some engines, and this value is
    // serialised alongside an encrypted credential — so the slice is the guard.
    const oversized = "a".repeat(MAX_MODEL_SLUG_LENGTH + 40);
    fireEvent.change(screen.getByLabelText(/model/i), {
      target: { value: oversized },
    });
    expect(onChange).toHaveBeenCalledWith("a".repeat(MAX_MODEL_SLUG_LENGTH));
  });

  it("shows a disabled loading field before the catalogue answers", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})) as never);
    renderField();

    const field = screen.getByLabelText(/model/i);
    expect(field).toBeDisabled();
    expect(field).toHaveAttribute("placeholder", "Loading models…");
  });

  it("abandons a stalled catalogue request instead of hanging on it", async () => {
    // Without the client-side timeout the field never leaves its loading state,
    // because the route's own 8s bound cannot rescue a request that stalls in
    // the browser.
    vi.useFakeTimers();
    const abortedWith: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: { signal: AbortSignal }) => {
        abortedWith.push(init.signal);
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        });
      }) as never,
    );
    renderField();
    expect(abortedWith[0].aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(13_000);
    expect(abortedWith[0].aborted).toBe(true);
  });
});
