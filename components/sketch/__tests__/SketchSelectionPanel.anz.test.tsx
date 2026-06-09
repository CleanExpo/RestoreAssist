// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import {
  SketchSelectionPanel,
  type MaterialOption,
} from "../SketchSelectionPanel";

const MATERIALS: MaterialOption[] = [
  { slug: "gyprock", name: "Gyprock (plasterboard)", isPotentialAcm: false },
  {
    slug: "fibro",
    name: "Fibro (fibrous-cement / AC sheet)",
    isPotentialAcm: true,
  },
];

const room = (over: Record<string, unknown> = {}) => ({
  id: "el1",
  type: "room",
  ...over,
});

describe("SketchSelectionPanel — ANZ material picker", () => {
  it("renders ANZ material options for a room and reports a change", () => {
    const onMaterialChange = vi.fn();
    render(
      <SketchSelectionPanel
        selected={room()}
        materials={MATERIALS}
        onMaterialChange={onMaterialChange}
      />,
    );
    const select = screen.getByLabelText(/material/i);
    expect(screen.getByText(/Gyprock/)).toBeInTheDocument();
    expect(screen.getByText(/Fibro/)).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "fibro" } });
    expect(onMaterialChange).toHaveBeenCalledWith("el1", "fibro");
  });

  it("captures the S500 water category for a room", () => {
    const onWaterCategoryChange = vi.fn();
    render(
      <SketchSelectionPanel
        selected={room()}
        onWaterCategoryChange={onWaterCategoryChange}
      />,
    );
    fireEvent.change(screen.getByLabelText(/water category/i), {
      target: { value: "cat3" },
    });
    expect(onWaterCategoryChange).toHaveBeenCalledWith("el1", "cat3");
  });
});

describe("SketchSelectionPanel — WHS asbestos gate", () => {
  it("blocks strip-out for suspected ACM on a pre-2004 build", () => {
    render(
      <SketchSelectionPanel
        selected={room({ materialSlug: "fibro" })}
        materials={MATERIALS}
        propertyYearBuilt={1995}
      />,
    );
    expect(screen.getByText(/asbestos/i)).toBeInTheDocument();
    expect(screen.getByText(/strip-?out|blocked/i)).toBeInTheDocument();
  });

  it("clears the block once a WHS pathway note is recorded", () => {
    render(
      <SketchSelectionPanel
        selected={room({
          materialSlug: "fibro",
          whsPathwayNote: "Licensed non-friable removalist engaged (QLD)",
        })}
        materials={MATERIALS}
        propertyYearBuilt={1995}
      />,
    );
    expect(screen.queryByText(/blocked/i)).not.toBeInTheDocument();
    expect(screen.getByText(/pathway recorded|permitted/i)).toBeInTheDocument();
  });

  it("records a WHS pathway via the input", () => {
    const onRecordWhsPathway = vi.fn();
    render(
      <SketchSelectionPanel
        selected={room({ materialSlug: "fibro" })}
        materials={MATERIALS}
        propertyYearBuilt={1995}
        onRecordWhsPathway={onRecordWhsPathway}
      />,
    );
    const input = screen.getByPlaceholderText(/WHS pathway/i);
    fireEvent.change(input, { target: { value: "Sampled — negative" } });
    fireEvent.click(screen.getByRole("button", { name: /record/i }));
    expect(onRecordWhsPathway).toHaveBeenCalledWith(
      "el1",
      "Sampled — negative",
    );
  });

  it("shows no WHS warning for a non-ACM material", () => {
    render(
      <SketchSelectionPanel
        selected={room({ materialSlug: "gyprock" })}
        materials={MATERIALS}
        propertyYearBuilt={1995}
      />,
    );
    expect(screen.queryByText(/asbestos/i)).not.toBeInTheDocument();
  });
});

describe("SketchSelectionPanel — NZ NHCover routing", () => {
  it("hides the NZ cause selector under the AU jurisdiction (default)", () => {
    render(<SketchSelectionPanel selected={room()} />);
    expect(
      screen.queryByText(/Damage cause \(NHCover\)/i),
    ).not.toBeInTheDocument();
  });

  it("toggling to NZ reports the jurisdiction change", () => {
    const onCountryChange = vi.fn();
    render(
      <SketchSelectionPanel
        selected={room()}
        onCountryChange={onCountryChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "NZ" }));
    expect(onCountryChange).toHaveBeenCalledWith("NZ");
  });

  it("routes building flood to the private insurer, land to NHCover", () => {
    render(
      <SketchSelectionPanel selected={room({ cause: "flood" })} country="NZ" />,
    );
    expect(screen.getByText(/Private insurer/i)).toBeInTheDocument();
    expect(screen.getByText("NHCover")).toBeInTheDocument();
  });

  it("routes earthquake building damage to NHCover", () => {
    render(
      <SketchSelectionPanel
        selected={room({ cause: "earthquake" })}
        country="NZ"
      />,
    );
    expect(screen.getAllByText("NHCover").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Private insurer/i)).not.toBeInTheDocument();
  });

  it("reports a cause change", () => {
    const onCauseChange = vi.fn();
    render(
      <SketchSelectionPanel
        selected={room()}
        country="NZ"
        onCauseChange={onCauseChange}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Damage cause/i), {
      target: { value: "tsunami" },
    });
    expect(onCauseChange).toHaveBeenCalledWith("el1", "tsunami");
  });
});
