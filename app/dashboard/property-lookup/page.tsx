import { PropertyLookupPanel } from "@/components/property/PropertyLookupPanel";

export const metadata = { title: "Property lookup — RestoreAssist" };

export default function PropertyLookupPage() {
  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-lg font-semibold text-slate-900 mb-1">
        Property lookup
      </h1>
      <p className="text-sm text-slate-500 mb-4">
        Paste a property listing page&apos;s HTML to extract beds, baths, land
        size and floor area. Automated address lookup is a separate gated
        feature.
      </p>
      <PropertyLookupPanel />
    </div>
  );
}
