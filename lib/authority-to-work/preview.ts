import type { FormDraft } from "./plan";

/**
 * The text lines the no-send preview prints for one draft: each field with its
 * value and source, or blank with its reason, then every reason it cannot be sent.
 */
export function formatDraft(f: FormDraft): string[] {
  return [
    "       fields:",
    ...f.fields.map((x) =>
      x.value !== null
        ? `         ${x.key}: ${x.value} (from ${x.source})`
        : `         ${x.key}: [blank] ${x.blankReason}`,
    ),
    "       not sendable because:",
    ...f.notSendableBecause.map((b) => `         - ${b}`),
  ];
}
