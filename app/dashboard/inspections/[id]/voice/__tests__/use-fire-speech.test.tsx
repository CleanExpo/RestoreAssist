// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { isEcho, useFireSpeech } from "../_fire/use-fire-speech";
import { getFireSection, sectionSpeech } from "@/lib/voice/fire-smoke/checklist";

/**
 * The microphone may reopen only on a confirmed end of Margot's speech:
 * the utterance's own end or error event, or the engine reporting it has
 * stopped. No amount of elapsed time may stand in for that.
 */

class FakeUtterance {
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  lang = "";
  rate = 1;
  ended = false;
  constructor(public text: string) {}
}
const spoken: FakeUtterance[] = [];
/** When true the engine stops without firing onend, as some phones do. */
let silentEnd = false;
const synth = {
  speak: (u: FakeUtterance) => spoken.push(u),
  cancel: () => {
    for (const u of spoken) {
      if (!u.ended) {
        u.ended = true;
        u.onerror?.();
      }
    }
  },
  get speaking() {
    return spoken.some((u) => !u.ended);
  },
  pending: false,
};
const endSpeech = (u: FakeUtterance) => {
  u.ended = true;
  if (!silentEnd) u.onend?.();
};

class FakeRecognition {
  static starts = 0;
  static last: FakeRecognition | null = null;
  /**
   * False models the real stop() contract: the engine may still deliver a
   * final result from captured audio, and fires onend only later.
   */
  static endOnStop = true;
  continuous = true;
  interimResults = true;
  lang = "";
  maxAlternatives = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  start() {
    FakeRecognition.last = this;
    FakeRecognition.starts += 1;
    this.onstart?.();
  }
  stop() {
    if (FakeRecognition.endOnStop) this.onend?.();
  }
}

const LONG_PROMPT = Array.from({ length: 12 }, () => "Check the ceiling and the wall linings.").join(" ");

function listeningHook() {
  const hook = renderHook(() => useFireSpeech({ onFinal: () => {}, onBlocked: () => {} }));
  act(() => hook.result.current.setListeningWanted(true));
  FakeRecognition.starts = 0; // count only starts after Margot begins
  return hook;
}

beforeEach(() => {
  vi.useFakeTimers();
  spoken.length = 0;
  silentEnd = false;
  FakeRecognition.starts = 0;
  FakeRecognition.endOnStop = true;
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  vi.stubGlobal("speechSynthesis", synth);
  vi.stubGlobal("webkitSpeechRecognition", FakeRecognition);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const finalResult = (transcript: string) => ({
  results: [Object.assign([{ transcript }], { isFinal: true })],
});

describe("useFireSpeech: only the live recognition is heard (K4)", () => {
  function heardHook() {
    const onFinal = vi.fn();
    const hook = renderHook(() => useFireSpeech({ onFinal, onBlocked: () => {} }));
    act(() => hook.result.current.setListeningWanted(true));
    return { hook, onFinal, rec: FakeRecognition.last! };
  }

  it("hears a final result from the live recognition", () => {
    const { onFinal, rec } = heardHook();
    act(() => rec.onresult?.(finalResult("Power is off at the board")));
    expect(onFinal).toHaveBeenCalledWith("Power is off at the board");
  });

  it("a final result delivered after the screen is left never reaches onFinal", () => {
    const { hook, onFinal, rec } = heardHook();
    FakeRecognition.endOnStop = false;
    hook.unmount(); // cleanup calls stop(); stop() may still deliver a result
    act(() => rec.onresult?.(finalResult("Late words after leaving")));
    act(() => vi.advanceTimersByTime(60_000));
    expect(onFinal).not.toHaveBeenCalled();
  });

  it("a result from a recognition stopped for Margot's prompt is dropped and does not restart the mic", () => {
    const { hook, onFinal, rec } = heardHook();
    FakeRecognition.endOnStop = false; // the engine reports late, as real ones may
    act(() => hook.result.current.speak(LONG_PROMPT));
    FakeRecognition.starts = 0;
    act(() => rec.onresult?.(finalResult("Words from the stopped mic")));
    act(() => rec.onend?.());
    act(() => vi.advanceTimersByTime(60_000));
    expect(onFinal).not.toHaveBeenCalled();
    expect(FakeRecognition.starts).toBe(0);
  });
});

describe("useFireSpeech: mic waits for Margot", () => {
  it("keeps the mic off through a long prompt, however long it runs", () => {
    const hook = listeningHook();
    act(() => hook.result.current.speak(LONG_PROMPT));
    act(() => vi.advanceTimersByTime(10 * 60_000));
    expect(FakeRecognition.starts).toBe(0);
    expect(hook.result.current.speaking).toBe(true);

    act(() => endSpeech(spoken[spoken.length - 1]));
    act(() => vi.advanceTimersByTime(0));
    expect(FakeRecognition.starts).toBe(1);
    expect(hook.result.current.speaking).toBe(false);
  });

  it("reopens the mic when the engine stops without firing onend", () => {
    silentEnd = true;
    const hook = listeningHook();
    act(() => hook.result.current.speak("Short prompt."));
    act(() => endSpeech(spoken[spoken.length - 1]));
    expect(FakeRecognition.starts).toBe(0);
    act(() => vi.advanceTimersByTime(600));
    expect(FakeRecognition.starts).toBe(1);
  });

  it("leaving the screen mid-prompt runs no callback and never opens the mic", () => {
    const hook = listeningHook();
    const after = vi.fn();
    act(() => hook.result.current.speak(LONG_PROMPT, after));
    hook.unmount(); // cleanup cancel() fires the utterance's onerror
    act(() => vi.advanceTimersByTime(60_000));
    expect(after).not.toHaveBeenCalled();
    expect(FakeRecognition.starts).toBe(0);
  });

  it("an earlier prompt's cancel event does not open the mic during the next prompt", () => {
    const hook = listeningHook();
    act(() => hook.result.current.speak("First prompt."));
    act(() => hook.result.current.speak(LONG_PROMPT)); // cancel() fires the first prompt's onerror
    act(() => vi.advanceTimersByTime(60_000));
    expect(FakeRecognition.starts).toBe(0);
    expect(hook.result.current.speaking).toBe(true);
  });
});

describe("useFireSpeech: React Strict Mode (development double mount)", () => {
  it("still listens and speaks after the extra setup and cleanup cycle", () => {
    const hook = renderHook(() => useFireSpeech({ onFinal: () => {}, onBlocked: () => {} }), { wrapper: StrictMode });
    act(() => hook.result.current.setListeningWanted(true));
    expect(FakeRecognition.starts).toBe(1);
    act(() => hook.result.current.speak("Short prompt."));
    expect(spoken).toHaveLength(1);
  });
});

describe("isEcho drops only Margot's own prompt heard back, never a real answer", () => {
  const prompt = sectionSpeech(getFireSection("site_access")!);

  it("a technician answer that happens to reuse words from the prompt is not an echo", () => {
    expect(isEcho("police or fire services have released the site", prompt)).toBe(false);
  });

  it("the whole prompt replayed is an echo", () => {
    expect(isEcho(prompt, prompt)).toBe(true);
  });

  it("most of the prompt replayed (the start cut off) is still an echo", () => {
    const words = prompt.split(" ");
    expect(isEcho(words.slice(0, Math.ceil(words.length * 0.9)).join(" "), prompt)).toBe(true);
  });
});
