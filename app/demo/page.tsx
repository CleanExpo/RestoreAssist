import { redirect } from "next/navigation";

/**
 * /demo (RA-8403). Demos are booked through the contact form, which reaches
 * the team for a human reply. This route exists so "Book a demo" links and
 * anyone typing /demo land on that form instead of a 404.
 */
export default function DemoPage() {
  redirect("/contact?topic=demo");
}
