import type { Metadata } from "next"
import ContactClient from "./contact-client"

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Get in touch with the Restore Assist team for support, demos, or partnership enquiries.",
}

export default function ContactPage() {
  return <ContactClient />
}
