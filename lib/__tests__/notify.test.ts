import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import toast from "react-hot-toast";
import { notifyError, notifySuccess } from "../notify";

describe("notifyError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("toasts a string message once with a stable id", () => {
    notifyError("Password rejected");
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith("Password rejected", {
      id: "ra-app-error",
    });
  });

  it("unwraps { code, message, eventId } instead of toasting the object", () => {
    notifyError({
      code: "VALIDATION",
      message: "This password has appeared in 121 known data breaches.",
      eventId: "evt_1",
    });
    expect(toast.error).toHaveBeenCalledWith(
      "This password has appeared in 121 known data breaches.",
      { id: "ra-app-error" },
    );
  });

  it("replaces a prior error toast when called again (same id)", () => {
    notifyError("First");
    notifyError("Second");
    expect(toast.error).toHaveBeenNthCalledWith(1, "First", {
      id: "ra-app-error",
    });
    expect(toast.error).toHaveBeenNthCalledWith(2, "Second", {
      id: "ra-app-error",
    });
  });
});

describe("notifySuccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("toasts success with a stable id", () => {
    notifySuccess("Saved");
    expect(toast.success).toHaveBeenCalledWith("Saved", {
      id: "ra-app-success",
    });
  });
});
