import { redirect } from "next/navigation";

/**
 * Legacy entitlement redirects (require-addon) send owners to `/subscribe`.
 * The checkout surface lives at `/dashboard/subscription`.
 */
export default function SubscribeRedirectPage() {
  redirect("/dashboard/subscription");
}
