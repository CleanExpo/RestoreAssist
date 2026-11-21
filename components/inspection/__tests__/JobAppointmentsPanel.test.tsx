// @vitest-environment jsdom
/**
 * RA-8497: the office books a visit with a date, times, a technician and a
 * note, and each booked visit shows who is going and the note.
 */
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { JobAppointmentsPanel } from "../JobAppointmentsPanel";

const members = [
  { id: "owner", name: "Owner", email: "o@x.test", role: "ADMIN" },
  { id: "tech1", name: "Sam Tech", email: "sam@x.test", role: "USER" },
  { id: "tech2", name: null, email: "kim@x.test", role: "USER" },
];

const booked = {
  id: "appt-1",
  title: "Re-attendance",
  startsAt: "2026-01-14T22:00:00.000Z",
  endsAt: "2026-01-15T00:00:00.000Z",
  status: "SCHEDULED",
  notes: "Ring the insured first.",
  assignedUserId: "tech1",
};

function json(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: async () => body });
}

let posted: Record<string, unknown> | null;
let appointments: unknown[];
let orgTimeZone: string | undefined;

beforeEach(() => {
  vi.restoreAllMocks();
  posted = null;
  appointments = [];
  orgTimeZone = undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/team/members") return json({ members });
      if (url.endsWith("/appointments") && init?.method === "POST") {
        posted = JSON.parse(String(init.body));
        appointments = [booked];
        return json({ data: booked });
      }
      if (url.endsWith("/appointments"))
        return json({ data: appointments, timeZone: orgTimeZone });
      return json({}, false);
    }),
  );
});

describe("JobAppointmentsPanel (RA-8497)", () => {
  it("books a visit with the chosen date, times, technician and note", async () => {
    render(<JobAppointmentsPanel inspectionId="i1" />);
    fireEvent.click(await screen.findByRole("button", { name: /add visit/i }));

    fireEvent.change(screen.getByLabelText("Visit"), {
      target: { value: "Re-attendance" },
    });
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2026-01-15" },
    });
    fireEvent.change(screen.getByLabelText("Start"), {
      target: { value: "09:00" },
    });
    fireEvent.change(screen.getByLabelText("End"), {
      target: { value: "11:00" },
    });
    const tech = await screen.findByLabelText("Technician");
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Sam Tech" })).toBeInTheDocument(),
    );
    fireEvent.change(tech, { target: { value: "tech1" } });
    fireEvent.change(screen.getByLabelText("Note for the technician"), {
      target: { value: "Ring the insured first." },
    });
    fireEvent.click(screen.getByRole("button", { name: /book visit/i }));

    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted).toEqual({
      title: "Re-attendance",
      date: "2026-01-15",
      startTime: "09:00",
      endTime: "11:00",
      assignedUserId: "tech1",
      notes: "Ring the insured first.",
    });
  });

  it("lists team members by name, or email when there is no name", async () => {
    render(<JobAppointmentsPanel inspectionId="i1" />);
    fireEvent.click(await screen.findByRole("button", { name: /add visit/i }));
    await screen.findByRole("option", { name: "Sam Tech" });
    expect(screen.getByRole("option", { name: "kim@x.test" })).toBeInTheDocument();
  });

  it("shows each visit's technician and note", async () => {
    appointments = [booked];
    render(<JobAppointmentsPanel inspectionId="i1" />);
    expect(await screen.findByText("Re-attendance")).toBeInTheDocument();
    expect(await screen.findByText(/Sam Tech/)).toBeInTheDocument();
    expect(screen.getByText("Ring the insured first.")).toBeInTheDocument();
  });

  it("shows the server's refusal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (url === "/api/team/members") return json({ members });
        if (init?.method === "POST")
          return json(
            { error: { code: "VALIDATION", message: "The visit must end after it starts" } },
            false,
          );
        return json({ data: [] });
      }),
    );
    render(<JobAppointmentsPanel inspectionId="i1" />);
    fireEvent.click(await screen.findByRole("button", { name: /add visit/i }));
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-01-15" } });
    fireEvent.change(screen.getByLabelText("Start"), { target: { value: "11:00" } });
    fireEvent.change(screen.getByLabelText("End"), { target: { value: "09:00" } });
    fireEvent.click(screen.getByRole("button", { name: /book visit/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The visit must end after it starts",
    );
  });

  it("shows booked times in the organisation's timezone, not the device's", async () => {
    // 9:00 to 11:00 am in Perth; noon in Sydney and 1 am in UTC.
    orgTimeZone = "Australia/Perth";
    appointments = [
      {
        ...booked,
        startsAt: "2026-01-15T01:00:00.000Z",
        endsAt: "2026-01-15T03:00:00.000Z",
      },
    ];
    render(<JobAppointmentsPanel inspectionId="i1" />);
    const when = await screen.findByText(/Thursday 15 January 2026/);
    expect(when.textContent).toMatch(/9:00\s?am to 11:00\s?am/i);
  });

  it("defaults the visit date to tomorrow in the organisation's timezone", async () => {
    // 11:30 UTC on 14 January: 00:30 on the 15th in Auckland (tomorrow is
    // the 16th), still the 14th in Sydney and in UTC (tomorrow the 15th).
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-14T11:30:00.000Z"));
    try {
      orgTimeZone = "Pacific/Auckland";
      render(<JobAppointmentsPanel inspectionId="i1" />);
      await screen.findByText("No appointments yet.");
      fireEvent.click(screen.getByRole("button", { name: /add visit/i }));
      expect(screen.getByLabelText("Date")).toHaveValue("2026-01-16");
    } finally {
      vi.useRealTimers();
    }
  });
});
