import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { reportError } = vi.hoisted(() => ({ reportError: vi.fn() }));

vi.mock("../../observability", () => ({ reportError }));

import {
  isRestoreAssistAiHealthy,
  resetHealthCache,
} from "../restoreassist-ai-client";

// With no RESTOREASSIST_AI_API_KEY in the test env, the health check hits the
// "not configured" branch and is deterministically unhealthy — no fetch mocking
// needed to exercise the down / edge-trigger behaviour.

describe("RestoreAssist AI self-hosted tier down alert (RA-6947)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetHealthCache();
    reportError.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires the ops alert once on the healthy→unhealthy transition", async () => {
    const healthy = await isRestoreAssistAiHealthy();

    expect(healthy).toBe(false);
    expect(reportError).toHaveBeenCalledTimes(1);
    const [, context] = reportError.mock.calls[0];
    expect(context).toMatchObject({ stage: "restoreassist-ai-tier-down" });
  });

  it("does NOT re-alert while the tier stays down across a cache cycle", async () => {
    await isRestoreAssistAiHealthy();
    expect(reportError).toHaveBeenCalledTimes(1);

    // Expire the 60s health cache so the next call re-probes (still down).
    vi.advanceTimersByTime(61_000);
    const stillDown = await isRestoreAssistAiHealthy();

    expect(stillDown).toBe(false);
    // Edge-triggered: no second alert for the same down episode.
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  it("re-arms the alert after resetHealthCache (fresh episode)", async () => {
    await isRestoreAssistAiHealthy();
    expect(reportError).toHaveBeenCalledTimes(1);

    resetHealthCache();
    await isRestoreAssistAiHealthy();

    expect(reportError).toHaveBeenCalledTimes(2);
  });
});
