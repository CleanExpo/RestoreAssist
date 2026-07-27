import AddonsClient from "./AddonsClient";
import BillingGate from "@/components/capacitor/BillingGate";

export const dynamic = "force-dynamic";

export default function AddonsPage() {
  return (
    <BillingGate>
      <AddonsClient />
    </BillingGate>
  );
}
