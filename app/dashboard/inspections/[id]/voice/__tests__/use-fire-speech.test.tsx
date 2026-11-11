// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useFireSpeech } from "../_fire/use-fire-speech";

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
  continuous = true;
  interimResults = true;
  lang = "";
  maxAlternatives = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  start() {
    FakeRecognition.starts += 1;
    this.onstart?.();
  }
  stop() {
    this.onend?.();
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
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  vi.stubGlobal("speechSynthesis", synth);
  vi.stubGlobal("webkitSpeechRecognition", FakeRecognition);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
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

  it("an earlier prompt's cancel event does not open the mic during the next prompt", () => {
    const hook = listeningHook();
    act(() => hook.result.current.speak("First prompt."));
    act(() => hook.result.current.speak(LONG_PROMPT)); // cancel() fires the first prompt's onerror
    act(() => vi.advanceTimersByTime(60_000));
    expect(FakeRecognition.starts).toBe(0);
    expect(hook.result.current.speaking).toBe(true);
  });
});
