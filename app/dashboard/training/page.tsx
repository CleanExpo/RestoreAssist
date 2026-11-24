import { DashboardPageFrame } from "@/app/dashboard/components/DashboardPageFrame";
import { DashboardListPageHeader } from "@/app/dashboard/components/DashboardListPageHeader";
import { TrainingRegisterPanel } from "./TrainingRegisterPanel";

/**
 * Mining pilot slice 6: the staff training register. Open to every signed-in
 * role (the dashboard layout requires a session). What each role sees and may
 * change is decided by the API, in lib/training/register-access.ts.
 */
export default function TrainingRegisterPage() {
  return (
    <DashboardPageFrame className="space-y-6 pb-10 pt-2">
      <DashboardListPageHeader
        title="Training register"
        description="Courses your staff have completed, when they expire, and the evidence."
      />
      <TrainingRegisterPanel />
    </DashboardPageFrame>
  );
}
