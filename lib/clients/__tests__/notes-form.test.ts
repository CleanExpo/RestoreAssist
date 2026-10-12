import { describe, expect, it, vi } from "vitest";
import { applyServerFieldError, clientFormSchema } from "../form";
import { CLIENT_NOTES_MAX_LENGTH } from "../notes";

const client = (notes: string) => ({ name: "Client One", email: "client@example.test", notes });

describe("Client Notes form contract", () => {
  it("accepts exactly 5,000 characters including ampersands", () => {
    const notes = "x".repeat(CLIENT_NOTES_MAX_LENGTH - 3) + "A&B";
    expect(clientFormSchema.parse(client(notes)).notes).toBe(notes);
  });

  it("rejects 5,001 characters with a field message", () => {
    const parsed = clientFormSchema.safeParse(client("x".repeat(CLIENT_NOTES_MAX_LENGTH + 1)));
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.notes?.[0]).toContain("5,000");
    }
  });

  it("places a server Notes rejection beside the modal field", () => {
    const setError = vi.fn();
    expect(applyServerFieldError({ setError }, "Notes must be 5,000 characters or fewer")).toBe(true);
    expect(setError).toHaveBeenCalledWith("notes", {
      type: "server",
      message: "Notes must be 5,000 characters or fewer",
    });
  });
});
