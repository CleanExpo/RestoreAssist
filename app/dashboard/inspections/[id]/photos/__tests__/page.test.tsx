// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PhotoPanel } from "../page";

const photo = {
  id: "photo-mock-1",
  url: "https://example.invalid/mock-photo.jpg",
  thumbnailUrl: null,
  location: "Mock lounge room",
  description: null,
  timestamp: "2026-08-09T00:00:00.000Z",
  fileSize: 1024,
  mimeType: "image/jpeg",
  damageCategory: "CAT_1" as const,
  damageClass: "CLASS_2" as const,
  s500SectionRef: "S500:2021 §12.2.1",
  roomType: "LIVING_ROOM" as const,
  moistureSource: "BURST_PIPE" as const,
  affectedMaterial: ["PLASTERBOARD" as const],
  surfaceOrientation: "WALL" as const,
  damageExtentEstimate: "MODERATE" as const,
  equipmentVisible: false,
  secondaryDamageIndicators: [],
  photoStage: "PRE_WORK" as const,
  captureAngle: "WIDE" as const,
  labelledBy: "HUMAN_TECHNICIAN" as const,
  technicianNotes: "Mock evidence only",
  moistureReadingLink: null,
};

describe("PhotoPanel accessibility", () => {
  it("exposes dialog semantics and a named close control", () => {
    const onClose = vi.fn();

    render(
      <PhotoPanel
        photo={photo}
        inspectionId="inspection-mock-1"
        onClose={onClose}
        onUpdate={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "Inspection photo details" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Close photo details" }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("exposes the equipment control as a named switch", () => {
    render(
      <PhotoPanel
        photo={photo}
        inspectionId="inspection-mock-1"
        onClose={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit Labels" }));

    const equipmentSwitch = screen.getByRole("switch", {
      name: "Equipment visible in frame",
    });
    expect(equipmentSwitch).toHaveAttribute("aria-checked", "false");

    fireEvent.click(equipmentSwitch);
    expect(equipmentSwitch).toHaveAttribute("aria-checked", "true");
  });
});
