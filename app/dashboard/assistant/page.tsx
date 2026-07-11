/**
 * RA-7026 Phase 2 (inc 3) — contractor assistant page.
 *
 * DARK BY DEFAULT: this server component 404s unless
 * CONTRACTOR_ASSISTANT_ENABLED === "true", so the whole surface (route + UI) is
 * invisible until the founder turns it on — matching the API gate.
 */

import { notFound } from "next/navigation";
import AssistantChat from "./AssistantChat";

export const metadata = {
  title: "Assistant · RestoreAssist",
};

export default function AssistantPage() {
  if (process.env.CONTRACTOR_ASSISTANT_ENABLED !== "true") {
    notFound();
  }
  return <AssistantChat />;
}
