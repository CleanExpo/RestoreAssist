import { redirect } from "next/navigation";

/**
 * Floor Plan workspace toggle removed.
 * With an active Floor Plan Underlay add-on, listing fetch runs automatically
 * on the inspection Floor Plan tab — no on/off setting.
 */
export default function FloorPlanSettingsPage() {
  redirect("/dashboard/addons");
}
