/**
 * Keeps what an owner typed into the invite form across a Stripe round trip or
 * a closed tab. It lives only in the owner's own browser, so a technician's
 * email never reaches Stripe or a URL. It never holds an idempotency key: a
 * restored key would replay the refusal the owner just paid to clear.
 */

export type InviteDraft = { email: string; role: "USER" | "MANAGER" };

const TTL_MS = 24 * 60 * 60 * 1000;

function storageKey(userId: string): string {
  return `restoreassist:invite-draft:${userId}`;
}

export function saveInviteDraft(userId: string, draft: InviteDraft): void {
  try {
    window.localStorage.setItem(
      storageKey(userId),
      JSON.stringify({
        email: draft.email,
        role: draft.role,
        expiresAt: Date.now() + TTL_MS,
      }),
    );
  } catch {
    // Private windows and blocked storage: the form still works, unsaved.
  }
}

export function clearInviteDraft(userId: string): void {
  try {
    window.localStorage.removeItem(storageKey(userId));
  } catch {
    // Nothing was stored if storage is unavailable.
  }
}

export function readInviteDraft(userId: string): InviteDraft | null {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      email?: unknown;
      role?: unknown;
      expiresAt?: unknown;
    };
    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt <= Date.now()) {
      clearInviteDraft(userId);
      return null;
    }
    if (
      typeof parsed.email !== "string" ||
      (parsed.role !== "USER" && parsed.role !== "MANAGER")
    ) {
      return null;
    }
    return { email: parsed.email, role: parsed.role };
  } catch {
    return null;
  }
}
