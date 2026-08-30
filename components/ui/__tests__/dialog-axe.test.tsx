// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import axe from "axe-core";
import { OrganizationLocaleSetting } from "@/components/settings/OrganizationLocaleSetting";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../dialog";

describe("consumer approval dialog accessibility", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("passes axe, receives focus and closes with Escape", async () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogTitle>Confirm your decision</DialogTitle>
            <DialogDescription>
              Review the scope before approving.
            </DialogDescription>
            <label htmlFor="axe-comments">Comments</label>
            <textarea id="axe-comments" />
            <button type="button">Submit decision</button>
          </DialogContent>
        </Dialog>
      );
    }
    const { baseElement } = render(
      <Harness />,
    );

    const results = await axe.run(baseElement, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
    await waitFor(() =>
      expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(
        true,
      ),
    );
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("runs axe against the actual organisation locale settings surface", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            country: "AU",
            timezone: "Australia/Brisbane",
            abn: "53004085616",
            acn: null,
            nzbn: null,
          },
        }),
      }),
    );
    const { baseElement } = render(<OrganizationLocaleSetting />);
    await screen.findByText(/Billing: AUD/);

    const results = await axe.run(baseElement, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
