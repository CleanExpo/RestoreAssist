import { describe, expect, it } from "vitest";
import {
  crossReferenceEvidencePhotos,
  parseEvidencePins,
  placeEvidencePins,
} from "../evidence-map";

describe("report evidence map", () => {
  it("drops unstable pins and numbers valid normalized pins", () => {
    expect(
      parseEvidencePins([
        {
          inspectionPhotoId: "p1",
          nx: 0.25,
          ny: 0.75,
          caption: "Kitchen leak",
        },
        { inspectionPhotoId: "legacy", x: 10, y: 20 },
        {
          inspectionPhotoId: "p2",
          nx: 0.5,
          ny: 0.5,
          sketchRoom: { name: "Hall" },
        },
      ]),
    ).toEqual([
      {
        label: "E1",
        nx: 0.25,
        ny: 0.75,
        caption: "Kitchen leak",
        inspectionPhotoId: "p1",
      },
      {
        label: "E2",
        nx: 0.5,
        ny: 0.5,
        caption: "Hall",
        inspectionPhotoId: "p2",
      },
    ]);
  });

  it("places DOM coordinates faithfully in bottom-up PDF space", () => {
    const [placed] = placeEvidencePins(
      [
        {
          label: "E1",
          nx: 0.25,
          ny: 0.75,
          caption: "Kitchen leak",
          inspectionPhotoId: "p1",
        },
      ],
      { x: 100, y: 50, width: 400, height: 200 },
    );

    expect(placed).toMatchObject({ cx: 200, cy: 100 });
  });

  it("numbers pins across floors and indexes matching gallery photos", () => {
    const { floors, labelsByPhotoId } = crossReferenceEvidencePhotos([
      {
        evidencePins: [
          {
            label: "E1",
            nx: 0.25,
            ny: 0.75,
            caption: "Kitchen leak",
            inspectionPhotoId: "photo-1",
          },
        ],
      },
      {
        evidencePins: [
          {
            label: "E1",
            nx: 0.5,
            ny: 0.5,
            caption: "Hall stain",
            inspectionPhotoId: "photo-2",
          },
          {
            label: "E2",
            nx: 0.6,
            ny: 0.6,
            caption: "Second kitchen view",
            inspectionPhotoId: "photo-1",
          },
        ],
      },
    ]);

    expect(
      floors
        .flatMap((floor) => floor.evidencePins ?? [])
        .map((pin) => pin.label),
    ).toEqual(["E1", "E2", "E3"]);
    expect(labelsByPhotoId.get("photo-1")).toEqual(["E1", "E3"]);
    expect(labelsByPhotoId.get("photo-2")).toEqual(["E2"]);
  });
});
