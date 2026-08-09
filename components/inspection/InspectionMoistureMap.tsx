import MoistureMappingCanvas from "@/components/inspection/MoistureMappingCanvas";

type MoistureReading = {
  id: string;
  location: string;
  surfaceType: string;
  moistureLevel: number;
  depth: string;
  notes: string | null;
};

type InspectionMoistureMapProps = {
  readings: MoistureReading[];
  floorPlanImageUrl: string | null;
};

export function InspectionMoistureMap({
  readings,
  floorPlanImageUrl,
}: InspectionMoistureMapProps) {
  if (readings.length === 0) {
    return (
      <div className="text-center py-12 text-neutral-400">
        No moisture readings to map — add readings first
      </div>
    );
  }

  return (
    <MoistureMappingCanvas
      readings={readings}
      initialBackgroundImage={floorPlanImageUrl}
    />
  );
}
