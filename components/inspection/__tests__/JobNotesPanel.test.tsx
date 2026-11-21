// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobNotesPanel } from "../JobNotesPanel";

const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

beforeEach(() => {
  cleanup();
  fetchMock.mockReset();
});

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

const older = {
  id: "n1",
  kind: "BOOKING",
  body: "Booked Tom for Tuesday",
  authorName: "Mia Office",
  authorRole: "MANAGER",
  createdAt: "2026-11-20T23:15:00.000Z",
};
const newer = {
  id: "n2",
  kind: "CALL",
  body: "Insured asked to move to Thursday",
  authorName: "Tom Tech",
  authorRole: "USER",
  createdAt: "2026-11-21T03:00:00.000Z",
};

describe("RA-8496 JobNotesPanel", () => {
  it("shows notes in the order served (newest first) with author, role, type and exact time", async () => {
    respond(200, { data: [newer, older] });
    render(<JobNotesPanel inspectionId="insp_1" />);

    const list = await screen.findByRole("list", {
      name: "Job notes, newest first",
    });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Insured asked to move to Thursday");
    expect(items[0]).toHaveTextContent("Tom Tech");
    expect(items[0]).toHaveTextContent("(Technician)");
    expect(items[0]).toHaveTextContent("Call with insured");
    expect(items[1]).toHaveTextContent("(Manager)");
    expect(items[1]).toHaveTextContent("Booking");
    const time = items[0].querySelector("time");
    expect(time?.getAttribute("dateTime")).toBe("2026-11-21T03:00:00.000Z");
    expect(time?.textContent).toMatch(/2026/);
    expect(time?.textContent).toMatch(/\d{1,2}:\d{2}/);
    expect(fetchMock).toHaveBeenCalledWith("/api/inspections/insp_1/notes");
  });

  it("adding a note posts kind and text, and puts the server's copy at the top", async () => {
    respond(200, { data: [older] });
    render(<JobNotesPanel inspectionId="insp_1" />);
    await screen.findByText("Booked Tom for Tuesday");

    fireEvent.change(screen.getByLabelText("Note type"), {
      target: { value: "REBOOKING" },
    });
    fireEvent.change(screen.getByLabelText("Note"), {
      target: { value: "Moved to Thursday 10 am" },
    });
    respond(201, {
      data: {
        ...newer,
        id: "n3",
        kind: "REBOOKING",
        body: "Moved to Thursday 10 am",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));

    await screen.findByText("Moved to Thursday 10 am");
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/inspections/insp_1/notes");
    expect(init.method).toBe("POST");
    const sent = JSON.parse(init.body);
    expect(sent).toMatchObject({
      kind: "REBOOKING",
      body: "Moved to Thursday 10 am",
    });
    expect(typeof sent.clientRequestId).toBe("string");
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Moved to Thursday 10 am");
    expect(items[1]).toHaveTextContent("Booked Tom for Tuesday");
    expect(screen.getByLabelText("Note")).toHaveValue("");
  });

  it("a failed load shows a plain message instead of crashing", async () => {
    respond(503, { error: { code: "FEATURE_UNAVAILABLE", message: "x" } });
    render(<JobNotesPanel inspectionId="insp_1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Job notes are not available yet.",
    );
  });

  it("a 503 that is not the feature being unavailable (an outage) does not say the feature is missing", async () => {
    respond(503, {
      error: { code: "SERVICE_UNAVAILABLE", message: "Database unreachable" },
    });
    render(<JobNotesPanel inspectionId="insp_1" />);
    const alert = await screen.findByRole("alert");
    expect(alert).not.toHaveTextContent("not available yet");
    expect(alert).toHaveTextContent("Database unreachable");
  });

  it("an Admin's note reads 'Admin', never 'Owner'", async () => {
    respond(200, {
      data: [{ ...older, authorRole: "ADMIN", authorName: "Ada Admin" }],
    });
    render(<JobNotesPanel inspectionId="insp_1" />);
    const item = await screen.findByRole("listitem");
    expect(item).toHaveTextContent("(Admin)");
    expect(item).not.toHaveTextContent("Owner");
  });

  it("says when older notes were left off the list", async () => {
    respond(200, { data: [newer], meta: { truncated: true } });
    render(<JobNotesPanel inspectionId="insp_1" />);
    expect(
      await screen.findByText(/older notes are not shown/i),
    ).toBeInTheDocument();
  });

  it("warns not to record card numbers or more health detail than the job needs", async () => {
    respond(200, { data: [] });
    render(<JobNotesPanel inspectionId="insp_1" />);
    await screen.findByText("No notes yet.");
    expect(screen.getByText(/card numbers/i)).toBeInTheDocument();
  });

  it("a retried save after a lost response sends the same request id, so the server makes one note", async () => {
    respond(200, { data: [] });
    render(<JobNotesPanel inspectionId="insp_1" />);
    await screen.findByText("No notes yet.");
    fireEvent.change(screen.getByLabelText("Note"), {
      target: { value: "Rang insured" },
    });
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    respond(200, { data: [] }); // the reload after the failure
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Note")).toHaveValue("Rang insured");
    respond(200, { data: { ...newer, id: "n9", body: "Rang insured" } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    await screen.findByText("Rang insured", { selector: "p" });
    const posts = fetchMock.mock.calls.filter(
      ([, init]) => init?.method === "POST",
    );
    expect(posts).toHaveLength(2);
    const [a, b] = posts.map(
      ([, init]) => JSON.parse(init.body).clientRequestId,
    );
    expect(a).toBeTruthy();
    expect(b).toBe(a);
  });

  it("a new draft after a saved note gets a new request id", async () => {
    respond(200, { data: [] });
    render(<JobNotesPanel inspectionId="insp_1" />);
    await screen.findByText("No notes yet.");
    for (const [i, text] of ["First", "Second"].entries()) {
      fireEvent.change(screen.getByLabelText("Note"), {
        target: { value: text },
      });
      respond(201, { data: { ...newer, id: `s${i}`, body: text } });
      fireEvent.click(screen.getByRole("button", { name: "Add note" }));
      await screen.findByText(text, { selector: "p" });
    }
    const ids = fetchMock.mock.calls
      .filter(([, init]) => init?.method === "POST")
      .map(([, init]) => JSON.parse(init.body).clientRequestId);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("a refused save shows the server's message and keeps the text", async () => {
    respond(200, { data: [] });
    render(<JobNotesPanel inspectionId="insp_1" />);
    await screen.findByText("No notes yet.");
    fireEvent.change(screen.getByLabelText("Note"), {
      target: { value: "Keep me" },
    });
    respond(400, {
      error: { code: "VALIDATION", message: "Choose what the note is for" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose what the note is for",
    );
    expect(screen.getByLabelText("Note")).toHaveValue("Keep me");
  });

  it("the draft cannot be changed while a save is pending, so a successful save never clears unsent text", async () => {
    respond(200, { data: [] });
    render(<JobNotesPanel inspectionId="insp_1" />);
    await screen.findByText("No notes yet.");
    const field = screen.getByLabelText("Note");
    fireEvent.change(field, { target: { value: "Rang insured" } });
    let answer!: (v: unknown) => void;
    fetchMock.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    await waitFor(() => expect(field).toHaveAttribute("readonly"));
    fireEvent.change(field, {
      target: { value: "Rang insured, then booked Tuesday" },
    });
    fireEvent.change(screen.getByLabelText("Note type"), {
      target: { value: "BOOKING" },
    });
    expect(field).toHaveValue("Rang insured");
    expect(screen.getByLabelText("Note type")).toHaveValue("GENERAL");
    answer({
      ok: true,
      status: 201,
      json: async () => ({
        data: { ...newer, id: "n5", kind: "GENERAL", body: "Rang insured" },
      }),
    });
    await screen.findByText("Rang insured", { selector: "p" });
    expect(field).toHaveValue("");
    expect(field).not.toHaveAttribute("readonly");
  });

  it("an edited draft after an uncertain failure is a new draft with a new request id", async () => {
    respond(200, { data: [] });
    render(<JobNotesPanel inspectionId="insp_1" />);
    await screen.findByText("No notes yet.");
    fireEvent.change(screen.getByLabelText("Note"), {
      target: { value: "Rang insured" },
    });
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    respond(200, { data: [] }); // the reload after the failure
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    await screen.findByRole("alert");
    fireEvent.change(screen.getByLabelText("Note"), {
      target: { value: "Rang insured, no answer" },
    });
    respond(201, {
      data: { ...newer, id: "n6", body: "Rang insured, no answer" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    await screen.findByText("Rang insured, no answer", { selector: "p" });
    const posts = fetchMock.mock.calls
      .filter(([, init]) => init?.method === "POST")
      .map(([, init]) => JSON.parse(init.body));
    expect(posts).toHaveLength(2);
    expect(posts[1].body).toBe("Rang insured, no answer");
    expect(posts[1].clientRequestId).not.toBe(posts[0].clientRequestId);
  });

  it("a 409 (the id already holds another note) keeps the text, says so, and the next try is a new draft", async () => {
    respond(200, { data: [] });
    render(<JobNotesPanel inspectionId="insp_1" />);
    await screen.findByText("No notes yet.");
    fireEvent.change(screen.getByLabelText("Note"), {
      target: { value: "Keep me" },
    });
    respond(409, {
      error: {
        code: "CONFLICT",
        message:
          "A different note was already saved under this draft. Your text was not saved; add it again.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your text was not saved",
    );
    expect(screen.getByLabelText("Note")).toHaveValue("Keep me");
    respond(201, { data: { ...newer, id: "n7", body: "Keep me" } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    await screen.findByText("Keep me", { selector: "p" });
    const ids = fetchMock.mock.calls
      .filter(([, init]) => init?.method === "POST")
      .map(([, init]) => JSON.parse(init.body).clientRequestId);
    expect(ids).toHaveLength(2);
    expect(ids[1]).not.toBe(ids[0]);
  });

  it("a list load that answers after a save does not drop the saved note", async () => {
    let listAnswer!: (v: unknown) => void;
    fetchMock.mockReturnValueOnce(
      new Promise((resolve) => {
        listAnswer = resolve;
      }),
    );
    render(<JobNotesPanel inspectionId="insp_1" />);
    fireEvent.change(screen.getByLabelText("Note"), {
      target: { value: "Saved while loading" },
    });
    respond(201, {
      data: { ...newer, id: "n8", body: "Saved while loading" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Note")).toHaveValue(""),
    );
    listAnswer({ ok: true, status: 200, json: async () => ({ data: [older] }) });
    await screen.findByText("Booked Tom for Tuesday");
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Saved while loading");
    expect(items[1]).toHaveTextContent("Booked Tom for Tuesday");
  });

  it("offers no edit or delete control", async () => {
    respond(200, { data: [newer, older] });
    render(<JobNotesPanel inspectionId="insp_1" />);
    await screen.findByText("Booked Tom for Tuesday");
    const buttons = screen
      .getAllByRole("button")
      .map((b) => b.textContent?.trim());
    expect(buttons).toEqual(["Add note"]);
  });
});
