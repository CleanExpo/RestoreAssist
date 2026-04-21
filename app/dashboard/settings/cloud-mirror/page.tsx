import { Metadata } from "next";
import { CloudMirrorPicker } from "@/components/settings/cloud-mirror-picker";

export const metadata: Metadata = {
  title: "Cloud mirror provider — RestoreAssist",
  description:
    "Pick where RestoreAssist mirrors your viewing-quality evidence files. Google Drive in v1; OneDrive and iCloud coming soon.",
};

export default function CloudMirrorSettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Cloud mirror</h1>
        <p className="text-sm text-muted-foreground">
          Where RestoreAssist copies viewing-quality evidence after it&apos;s produced.
        </p>
      </div>
      <CloudMirrorPicker />
    </div>
  );
}
