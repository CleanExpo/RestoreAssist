import { redirect } from "next/navigation";

/**
 * SSOT: form template list lives at `/dashboard/forms/templates`.
 * Editor routes (`/new`, `/[id]`) remain under `/dashboard/form-templates/*`
 * and are linked from the forms templates UI.
 */
export default function FormTemplatesListRedirect() {
  redirect("/dashboard/forms/templates");
}
