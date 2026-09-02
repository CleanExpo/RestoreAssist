// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("react-hot-toast", () => ({
  default: { success: toastSuccess, error: toastError },
}));

import { BusinessDetailsSetting } from "@/components/settings/BusinessDetailsSetting";

const fetchMock = vi.fn();

beforeEach(() => {
  toastSuccess.mockReset();
  toastError.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

function profileResponse(profile: Record<string, unknown>) {
  return { ok: true, json: async () => ({ profile }) };
}

describe("BusinessDetailsSetting (RA-7432)", () => {
  it("shows the stored business name and address", async () => {
    fetchMock.mockResolvedValueOnce(
      profileResponse({
        businessName: "Acme Restoration",
        businessAddress: "1 Main St, Brisbane QLD 4000",
      }),
    );
    render(<BusinessDetailsSetting />);
    await waitFor(() =>
      expect(screen.getByLabelText("Business name")).toHaveValue("Acme Restoration"),
    );
    expect(screen.getByLabelText("Business address")).toHaveValue(
      "1 Main St, Brisbane QLD 4000",
    );
  });

  it("saves exactly business name and address, and nothing else", async () => {
    fetchMock
      .mockResolvedValueOnce(profileResponse({ businessName: null, businessAddress: null }))
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    render(<BusinessDetailsSetting />);
    await waitFor(() => screen.getByLabelText("Business name"));

    fireEvent.change(screen.getByLabelText("Business name"), {
      target: { value: "  Acme Restoration " },
    });
    fireEvent.change(screen.getByLabelText("Business address"), {
      target: { value: "1 Main St, Brisbane QLD 4000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save business details" }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Business details saved"));
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/user/profile");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({
      businessName: "Acme Restoration",
      businessAddress: "1 Main St, Brisbane QLD 4000",
    });
  });

  it("never offers an empty form when the stored details could not be loaded (review P1)", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
    render(<BusinessDetailsSetting />);
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(screen.queryByLabelText("Business name")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save business details" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("Try again reloads and then shows the stored details", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValueOnce(profileResponse({ businessName: "Acme", businessAddress: "1 Main St" }));
    render(<BusinessDetailsSetting />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByLabelText("Business name")).toHaveValue("Acme"));
    expect(screen.getByLabelText("Business address")).toHaveValue("1 Main St");
  });

  it("surfaces the server's error message when the save is refused", async () => {
    fetchMock
      .mockResolvedValueOnce(profileResponse({}))
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: "Invalid ABN — nope" } }),
      });
    render(<BusinessDetailsSetting />);
    await waitFor(() => screen.getByLabelText("Business name"));
    fireEvent.click(screen.getByRole("button", { name: "Save business details" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Invalid ABN — nope"));
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
