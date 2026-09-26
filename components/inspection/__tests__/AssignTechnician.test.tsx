// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import { AssignTechnician } from "../AssignTechnician";

beforeEach(() => vi.restoreAllMocks());

describe("AssignTechnician (J-07)", () => {
  it("lists only technicians and saves the chosen one on the job", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          members: [
            { id: "owner", name: "Owner", email: "o@x", role: "ADMIN" },
            { id: "mgr", name: "Manager", email: "m@x", role: "MANAGER" },
            { id: "tech1", name: "Tech One", email: "t1@x", role: "USER" },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal("fetch", f);
    const onAssigned = vi.fn();

    render(<AssignTechnician inspectionId="i1" technicianId={null} onAssigned={onAssigned} />);

    const select = await screen.findByLabelText("Assigned technician");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Unassigned",
      "Tech One",
    ]);

    fireEvent.change(select, { target: { value: "tech1" } });

    await waitFor(() => expect(onAssigned).toHaveBeenCalledWith("tech1"));
    expect(f).toHaveBeenLastCalledWith(
      "/api/inspections/i1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ technicianId: "tech1" }) }),
    );
  });

  it("keeps the current assignee when the server refuses", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ members: [{ id: "tech1", name: "Tech One", email: "t1@x", role: "USER" }] }),
      })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Choose a technician from your team" }) });
    vi.stubGlobal("fetch", f);
    const onAssigned = vi.fn();

    render(<AssignTechnician inspectionId="i1" technicianId={null} onAssigned={onAssigned} />);
    fireEvent.change(await screen.findByLabelText("Assigned technician"), { target: { value: "tech1" } });

    await waitFor(() => expect(f).toHaveBeenCalledTimes(2));
    expect(onAssigned).not.toHaveBeenCalled();
  });
});
