// @vitest-environment jsdom
/**
 * Behaviour of the volume picker itself. `lib/pricing/__tests__/unit-rate*`
 * covers the arithmetic; this file covers what a buyer sees and hears, which
 * had no test at all before.
 *
 * The money figures below are written as literals on purpose. Deriving them
 * from `planForVolume` inside the test would make the assertions agree with
 * the component by construction — the two would move together and the suite
 * would pass through any pricing change, correct or not. $99 / $199 / $0.90
 * are the numbers the shipped billing code produces for this catalogue, and
 * they are checked as such.
 *
 * Typing is simulated with successive `change` events rather than a
 * keystroke-level driver, because that is exactly what React receives from a
 * controlled input: three characters, three renders. `@testing-library/
 * user-event` is not a dependency of this repo and adding one for a test is
 * not worth it.
 */

import { render, screen, within, act, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { VolumePicker } from "../VolumePicker";

/** Longer than ANNOUNCE_DELAY_MS in the component. */
const PAST_DEBOUNCE = 1000;

const field = () => screen.getByLabelText("Reports per month");
const liveRegion = () =>
  document.querySelector('[role="status"]') as HTMLElement;
const summary = () =>
  document.querySelector(".mt-8.rounded-2xl") as HTMLElement;

const typeInto = (value: string) =>
  fireEvent.change(field(), { target: { value } });

/** Flush the announcement debounce without waiting in real time. */
function settleAnnouncement() {
  act(() => {
    vi.advanceTimersByTime(PAST_DEBOUNCE);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("VolumePicker — the recurrence split", () => {
  it("shows the first month and every month after, with a rate for each", () => {
    // 110 a month: the plan's 50 plus a 60-pack bought once. The picker used
    // to print a single "$199 total each month" at $1.81 per report. The code
    // charges $199 once and $99 a month after that.
    render(<VolumePicker initialReports={110} />);

    const panel = summary();
    expect(within(panel).getByText("Your first month")).toBeInTheDocument();
    expect(within(panel).getByText("$199")).toBeInTheDocument();
    expect(within(panel).getByText("Every month after")).toBeInTheDocument();
    expect(within(panel).getByText("$99")).toBeInTheDocument();

    expect(panel.textContent).toContain("$1.81 per report");
    expect(panel.textContent).toContain("$0.90 per report");
    // The claim that makes the ongoing figure true, stated on the page.
    expect(panel.textContent).toContain("one-off purchase, not a second");
    // And the thing that must NOT be said any more.
    expect(within(panel).queryByText("Total each month")).toBeNull();
  });

  it("keeps a single monthly figure when no pack is bought", () => {
    render(<VolumePicker initialReports={50} />);

    const panel = summary();
    expect(within(panel).getByText("Total each month")).toBeInTheDocument();
    expect(within(panel).getByText("$99")).toBeInTheDocument();
    expect(within(panel).getByText("$1.98")).toBeInTheDocument();
    // No split, because nothing one-off is being charged.
    expect(within(panel).queryByText("Every month after")).toBeNull();
    expect(within(panel).queryByText("Your first month")).toBeNull();
  });

  it("announces both figures, not one blended monthly total", () => {
    render(<VolumePicker initialReports={110} />);
    settleAnnouncement();

    const spoken = liveRegion().textContent ?? "";
    expect(spoken).toContain("$199 in the first month");
    expect(spoken).toContain("then $99 a month");
    expect(spoken).toContain("$0.90 per report from the second month on");
    expect(spoken).toContain("110 reports available each month");
  });

  it("labels the pack line as one-off and the plan line as monthly", () => {
    render(<VolumePicker initialReports={110} />);
    const panel = summary();
    expect(panel.textContent).toContain("$99 a month");
    expect(panel.textContent).toContain("$100 once");
    expect(panel.textContent).toContain("1 × 60 Reports Pack");
  });
});

describe("VolumePicker — overshoot disclosure", () => {
  it("splits the spare reports by cause instead of blaming the blocks", () => {
    // 152 a month is 102 over. 2 x 60-pack and 1 x 60-pack + 2 x 25-pack both
    // cost $200; 8 of the 18 spare reports are forced by the block sizes and
    // the other 10 are the tie-break buying up at the same price.
    render(<VolumePicker initialReports={152} />);

    const panel = summary();
    expect(panel.textContent).toContain(
      "170 reports available each month — 18 more than the 152 you asked for",
    );
    expect(panel.textContent).toContain("8 of those spare reports are what the");
    expect(panel.textContent).toContain("The other 10 we could have left out");
    // The false sentence this replaces.
    expect(panel.textContent).not.toContain(
      "The spare reports are what the block sizes leave behind, not a bulk discount",
    );
  });

  it("attributes the whole spare to the blocks when that is true", () => {
    // 105 a month is 55 over. One 60-pack at $100 is the unique cheapest
    // cover, so all 5 spare reports really are block granularity.
    render(<VolumePicker initialReports={105} />);

    const panel = summary();
    expect(panel.textContent).toContain(
      "110 reports available each month — 5 more than the 105 you asked for",
    );
    expect(panel.textContent).toContain(
      "Every spare report there is what the block sizes leave behind",
    );
    expect(panel.textContent).not.toContain("we could have left out");
  });

  it("explains the smallest block when barely over the allowance", () => {
    render(<VolumePicker initialReports={51} />);
    expect(summary().textContent).toContain(
      "The smallest pack sold is 8 reports, so going even one over your plan means buying 8",
    );
  });

  it("explains unused plan reports when under the allowance", () => {
    render(<VolumePicker initialReports={40} />);
    const panel = summary();
    expect(panel.textContent).toContain(
      "Your plan includes 50 reports — 10 more than the 40 you asked for",
    );
    expect(panel.textContent).toContain("No packs are involved here");
    expect(panel.textContent).toContain("$2.48");
  });
});

describe("VolumePicker — input parsing", () => {
  it("quotes what was typed once it is a legal whole number", () => {
    render(<VolumePicker initialReports={50} />);
    typeInto("1");
    typeInto("12");
    typeInto("120");

    expect(field()).toHaveValue(120);
    expect(summary().textContent).toContain("Your first month");
    expect(field()).toHaveAttribute("aria-invalid", "false");
  });

  it("holds the last legal quote and says so when the field is empty", () => {
    render(<VolumePicker initialReports={80} />);
    typeInto("");

    expect(
      screen.getByText(
        "Type a number from 1 to 500. The figures below are still for 80 reports a month.",
      ),
    ).toBeInTheDocument();
    expect(field()).toHaveAttribute("aria-invalid", "true");
    // The figures did not silently move to something else.
    expect(summary().textContent).toContain("80 you asked for");
  });

  it("refuses a figure above the range and names both numbers", () => {
    render(<VolumePicker initialReports={50} />);
    typeInto("501");

    expect(
      screen.getByText(
        "This picker goes up to 500 reports a month, so the figures below are for 50, not 501. Writing more than that? Talk to us about a volume plan.",
      ),
    ).toBeInTheDocument();
  });

  it("refuses zero rather than quoting a rate over no reports", () => {
    render(<VolumePicker initialReports={50} />);
    typeInto("0");

    expect(
      screen.getByText(
        "A per-report figure needs at least 1 report a month, so the figures below are for 50, not 0.",
      ),
    ).toBeInTheDocument();
  });

  it("rejects the shapes a number field would otherwise smuggle through", () => {
    // "1e5", "1.5" and "-3" are all valid to type into type=number, and
    // Number.parseInt reads them as 1, 1 and -3 — a silently wrong quote.
    render(<VolumePicker initialReports={50} />);
    for (const bad of ["1e5", "1.5", "-3"]) {
      typeInto(bad);
      expect(
        screen.getByText(
          "That is not a whole number of reports, so the figures below are for 50 reports a month.",
        ),
        bad,
      ).toBeInTheDocument();
    }
  });

  it("restores the quoted figure when a rejected entry is blurred away", () => {
    render(<VolumePicker initialReports={80} />);
    typeInto("");
    fireEvent.blur(field());

    expect(field()).toHaveValue(80);
    expect(field()).toHaveAttribute("aria-invalid", "false");
  });

  it("clamps an out-of-range entry on blur rather than dropping it", () => {
    render(<VolumePicker initialReports={80} />);
    typeInto("900");
    fireEvent.blur(field());

    expect(field()).toHaveValue(500);
  });
});

describe("VolumePicker — controls", () => {
  it("steps by five in both directions", () => {
    render(<VolumePicker initialReports={100} />);
    fireEvent.click(screen.getByLabelText("More reports, increase by 5"));
    expect(field()).toHaveValue(105);
    fireEvent.click(screen.getByLabelText("Fewer reports, decrease by 5"));
    expect(field()).toHaveValue(100);
  });

  it("stops at the bounds without leaving the tab order", () => {
    render(<VolumePicker initialReports={500} />);
    const more = screen.getByLabelText(
      "More reports — already at the maximum of 500",
    );
    // aria-disabled, not disabled: a disabled button drops out of the tab
    // order under the user's own focus. The distinction is deliberate, so it
    // is asserted rather than left to be "tidied up" later.
    expect(more).toHaveAttribute("aria-disabled", "true");
    expect(more).not.toBeDisabled();
    fireEvent.click(more);
    expect(field()).toHaveValue(500);
    expect(
      screen.getByText(
        "500 a month is the most this picker covers. Talk to us about a volume plan above that.",
      ),
    ).toBeInTheDocument();
  });

  it("marks the matching preset as pressed", () => {
    render(<VolumePicker initialReports={50} />);
    const preset = screen.getByRole("button", { name: "120 a month" });
    expect(preset).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(preset);
    expect(preset).toHaveAttribute("aria-pressed", "true");
    expect(field()).toHaveValue(120);
  });
});

describe("VolumePicker — accessibility wiring", () => {
  it("wires the field to its hint, its notice and its steppers", () => {
    render(<VolumePicker initialReports={50} />);
    const input = field();
    expect(input).toHaveAttribute("inputMode", "numeric");

    const described = input.getAttribute("aria-describedby");
    expect(described).toBeTruthy();
    expect(document.getElementById(described!.split(" ")[0])).toHaveTextContent(
      "Anything from 1 to 500 reports a month",
    );

    for (const label of [
      "More reports, increase by 5",
      "Fewer reports, decrease by 5",
    ]) {
      expect(screen.getByLabelText(label)).toHaveAttribute(
        "aria-controls",
        input.id,
      );
    }

    // Both the hint and the notice, in that order, once there is a notice.
    typeInto("");
    expect(field().getAttribute("aria-describedby")?.split(" ")).toHaveLength(2);
  });

  it("keeps the live summary polite and out of sight", () => {
    render(<VolumePicker initialReports={50} />);
    expect(liveRegion()).toHaveAttribute("aria-live", "polite");
    expect(liveRegion()).toHaveClass("sr-only");
  });
});

describe("VolumePicker — the live region is debounced", () => {
  it("announces once for a run of keystrokes, not once per keystroke", () => {
    render(<VolumePicker initialReports={50} />);
    settleAnnouncement();
    const before = liveRegion().textContent;

    // Three keystrokes. Undebounced, this is three complete announcements of
    // the notice plus the whole quote sentence.
    typeInto("1");
    typeInto("12");
    typeInto("120");

    // Visible figures have already moved...
    expect(summary().textContent).toContain("Your first month");
    // ...while the spoken summary has not yet said anything new.
    expect(liveRegion().textContent).toBe(before);

    settleAnnouncement();
    expect(liveRegion().textContent).not.toBe(before);
    expect(liveRegion().textContent).toContain("At 120 reports a month");
  });

  it("still announces — the summary is delayed, never dropped", () => {
    render(<VolumePicker initialReports={50} />);
    settleAnnouncement();

    fireEvent.click(screen.getByRole("button", { name: "200 a month" }));
    settleAnnouncement();

    const spoken = liveRegion().textContent ?? "";
    expect(spoken).toContain("At 200 reports a month");
    expect(spoken).toContain("in the first month");
  });

  it("leads with the mismatch, so the figures are never heard unlabelled", () => {
    render(<VolumePicker initialReports={80} />);
    settleAnnouncement();

    typeInto("");
    settleAnnouncement();

    expect(liveRegion().textContent).toMatch(
      /^Type a number from 1 to 500\. The figures below are still for 80 reports a month\. At 80 reports a month:/,
    );
  });
});
