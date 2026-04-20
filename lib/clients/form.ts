// RA-1201 — shared form schema + helpers extracted from
// app/dashboard/clients/page.tsx. Used by both the Add and Edit modals.

import { z } from "zod";
import type { useForm } from "react-hook-form";

// RA-1215 — long add/edit client forms (10+ fields) previously showed
// validation errors via react-hot-toast which disappears after 4s. Users
// missed which field failed. Validation + server 400 field errors now
// render inline via shadcn <FormMessage>. Network / 5xx keeps toast.
export const clientFormSchema = z.object({
  name: z.string().trim().min(1, "Client name is required"),
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  phone: z.string().optional().default(""),
  address: z.string().optional().default(""),
  company: z.string().optional().default(""),
  contactPerson: z.string().optional().default(""),
  notes: z.string().optional().default(""),
  status: z.string().default("ACTIVE"),
});
export type ClientFormValues = z.infer<typeof clientFormSchema>;

export const CLIENT_FORM_DEFAULTS: ClientFormValues = {
  name: "",
  email: "",
  phone: "",
  address: "",
  company: "",
  contactPerson: "",
  notes: "",
  status: "ACTIVE",
};

// Map a server error string onto the offending field when we can recognise it.
// Returns true when a field error was set (render inline), false when caller
// should fall back to toast (generic / unclassifiable).
export function applyServerFieldError(
  form: ReturnType<typeof useForm<ClientFormValues>>,
  message: string | undefined,
): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  if (m.includes("email")) {
    form.setError("email", { type: "server", message });
    return true;
  }
  if (m.includes("name")) {
    form.setError("name", { type: "server", message });
    return true;
  }
  return false;
}
