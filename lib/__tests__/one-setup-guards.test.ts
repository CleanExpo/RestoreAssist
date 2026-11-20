import { describe, expect, it } from "vitest";
import {
  assertDisposableDatabase,
  assertStripeTestKey,
} from "../../e2e/one-setup-path/guards";

describe("one-setup browser test guards", () => {
  it("refuses a remote database, whatever it is called", () => {
    expect(() =>
      assertDisposableDatabase("postgresql://u@db.example.test:5432/one_setup"),
    ).toThrow(/not a local database/);
  });
  it.each(["host", "hostaddr"])("refuses a local address whose %s option points elsewhere", (option) => {
    expect(() =>
      assertDisposableDatabase(
        `postgresql://u@localhost:5432/one_setup?${option}=db.example.test`,
      ),
    ).toThrow(/not a local database/);
  });
  it("refuses a local database not named as disposable", () => {
    expect(() =>
      assertDisposableDatabase("postgresql://u@localhost:5432/restoreassist"),
    ).toThrow(/must contain one_setup/);
  });
  it("refuses a missing database", () => {
    expect(() => assertDisposableDatabase(undefined)).toThrow(/missing/);
  });
  it("accepts the disposable local database", () => {
    expect(() =>
      assertDisposableDatabase("postgresql://u@localhost:5432/one_setup_disposable"),
    ).not.toThrow();
  });
  it("refuses anything but a test key", () => {
    expect(() => assertStripeTestKey("sk_" + "live_x")).toThrow(/not a Stripe test key/);
    expect(() => assertStripeTestKey(undefined)).toThrow(/not a Stripe test key/);
    expect(() => assertStripeTestKey("sk_test_x")).not.toThrow();
  });
});
