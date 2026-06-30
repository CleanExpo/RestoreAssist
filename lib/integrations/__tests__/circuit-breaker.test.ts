import { describe, expect, it } from "vitest";
import { CircuitBreaker, CircuitState } from "../circuit-breaker";

// STORM #10 regression: the breaker used to record every request as a success
// (success was derived from circuit state, not the real outcome), so
// getFailureRate() stayed ~0 and the rate-based open path was dead — flaky
// integrations never tripped it.
const opts = {
  failureThreshold: 100, // high, so the consecutive-count path can't fire
  successThreshold: 1,
  timeout: 1000,
  windowSize: 60_000,
};
const fail = () => Promise.reject(new Error("boom"));
const ok = () => Promise.resolve("ok");

describe("CircuitBreaker rate-based opening", () => {
  it("opens via failure rate once recorded failures exceed the threshold", async () => {
    const cb = new CircuitBreaker("rate-test", opts);
    await expect(cb.execute(fail)).rejects.toThrow("boom");
    expect(cb.getState()).toBe(CircuitState.CLOSED);
    // Second failure: getFailureRate() now sees the first real failure (1.0 >= 0.5)
    await expect(cb.execute(fail)).rejects.toThrow("boom");
    expect(cb.getState()).toBe(CircuitState.OPEN);
  });

  it("stays closed while calls succeed", async () => {
    const cb = new CircuitBreaker("ok-test", opts);
    for (let i = 0; i < 5; i++) {
      await expect(cb.execute(ok)).resolves.toBe("ok");
    }
    expect(cb.getState()).toBe(CircuitState.CLOSED);
  });
});
