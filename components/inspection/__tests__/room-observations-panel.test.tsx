// @vitest-environment jsdom
/**
 * RA-7694: the room observations panel. A failed read is an error, never an
 * empty list; a save posts the structured fields; a refusal is shown.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RoomObservationsPanel } from "../RoomObservationsPanel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe("RoomObservationsPanel", () => {
  it("says nothing prints yet when the job has none", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json(200, { observations: [] })));
    render(<RoomObservationsPanel inspectionId="i1" />);
    expect(await screen.findByTestId("room-observations-empty")).toBeTruthy();
  });

  it("shows an error with Try again when the read fails, never an empty list", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json(500, { error: "x" })));
    render(<RoomObservationsPanel inspectionId="i1" />);
    expect(await screen.findByText(/could not load the recorded observations/i)).toBeTruthy();
    expect(screen.queryByTestId("room-observations-empty")).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("lists recorded observations under their room", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        json(200, {
          observations: [
            {
              roomLabel: "Bedroom 2",
              kind: "ODOUR",
              basis: "OBSERVED",
              odourDescriptor: "musty",
              odourPattern: "INTERMITTENT",
              odourIntensity: 2,
            },
          ],
        }),
      ),
    );
    render(<RoomObservationsPanel inspectionId="i1" />);
    const list = await screen.findByTestId("room-observations-list");
    expect(list.textContent).toContain("Bedroom 2");
    expect(list.textContent).toContain("musty; intermittent; intensity 2 of 3");
  });

  it("says when observations were left out of the list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        json(200, {
          observations: [{ roomLabel: "Hall", kind: "STAINING", basis: "OBSERVED", surface: "wall" }],
          omitted: 4,
        }),
      ),
    );
    render(<RoomObservationsPanel inspectionId="i1" />);
    const note = await screen.findByTestId("room-observations-omitted");
    expect(note.textContent).toBe("4 further recorded observations are not shown here.");
  });

  it("posts the structured odour fields and reloads", async () => {
    const calls: Array<{ method?: string; body?: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_u: string, init?: RequestInit) => {
        calls.push({ method: init?.method, body: init?.body as string | undefined });
        return init?.method === "POST"
          ? json(201, { observation: { id: "ro_1" } })
          : json(200, { observations: [] });
      }),
    );
    render(<RoomObservationsPanel inspectionId="i1" />);
    await screen.findByTestId("room-observations-empty");
    fireEvent.change(screen.getByLabelText("Room"), { target: { value: "Bedroom 2" } });
    fireEvent.change(screen.getByLabelText("Smell (for example musty)"), { target: { value: "musty" } });
    fireEvent.change(screen.getByLabelText("Constant or intermittent"), { target: { value: "INTERMITTENT" } });
    fireEvent.change(screen.getByLabelText("Intensity"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save observation" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    const post = calls.find((c) => c.method === "POST")!;
    expect(JSON.parse(post.body as string)).toMatchObject({
      kind: "ODOUR",
      roomLabel: "Bedroom 2",
      basis: "OBSERVED",
      odourDescriptor: "musty",
      odourPattern: "INTERMITTENT",
      odourIntensity: 2,
    });
  });

  it("shows the server's refusal and keeps what was typed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_u: string, init?: RequestInit) =>
        init?.method === "POST"
          ? json(422, { error: { message: "Name the room: sketchRoomId or roomLabel" } })
          : json(200, { observations: [] }),
      ),
    );
    render(<RoomObservationsPanel inspectionId="i1" />);
    await screen.findByTestId("room-observations-empty");
    fireEvent.change(screen.getByLabelText("Smell (for example musty)"), { target: { value: "musty" } });
    fireEvent.click(screen.getByRole("button", { name: "Save observation" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/room/i);
    expect((screen.getByLabelText("Smell (for example musty)") as HTMLInputElement).value).toBe("musty");
  });
});
