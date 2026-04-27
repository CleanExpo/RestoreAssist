/**
 * stabilisation-packet.ts — RA-1394 / Motion M-19.
 *
 * End-to-end carrier submission of a Stabilisation Authority Packet:
 * a typed dossier of evidence assembled from a committed
 * `attest_stabilisation` ProgressTransition, dispatched to one of:
 * Guidewire (sandbox), Youi (Tier-2), or Hollard (Tier-2).
 *
 * Design rules:
 *   - Neither function throws (rule 13). Both return discriminated unions
 *     with explicit error reasons so callers can log + retry.
 *   - Idempotency: every outbound POST carries `X-Idempotency-Key:
 *     ${transitionId}:${carrier}` (principle 7). Replays of the same
 *     transition must not double-submit.
 *   - Carrier endpoints are env-gated. Missing env vars surface as a
 *     deterministic "carrier endpoint not configured" — never a runtime
 *     crash.
 *   - DI-style fetchDelegate so vitest can stub the build-time prisma
 *     reads, and globalThis.fetch is mocked for the network calls.
 *
 * Board reference: .claude/board-2026-04-18/00-board-minutes.md §8 M-19.
 * Wired from lib/progress/service.ts dispatchIntegrations on
 * attest_stabilisation success.
 */

export type CarrierKey = "guidewire" | "youi" | "hollard";

export const CARRIERS: readonly CarrierKey[] = [
  "guidewire",
  "youi",
  "hollard",
] as const;

// ─── Packet shape ────────────────────────────────────────────────────────────

export interface AttestorIdentity {
  userId: string;
  role: string;
  name: string;
  email: string;
}

export interface EvidenceItemRef {
  type: string;
  id: string;
  hash?: string | null;
}

export interface StabilisationPacket {
  /** Stable identifier — also used as idempotency key suffix. */
  transitionId: string;
  claimProgressId: string;
  /** ISO timestamp of the transition. */
  transitionedAt: string;
  /** Origin URL for audit / verification (e.g. https://restoreassist.app/...). */
  origin?: string | null;

  attestor: AttestorIdentity;

  /** Audit-defence snapshot recorded by the M-21 guard at commit time. */
  guardSnapshot: Record<string, unknown>;
  /** Tamper-evidence integrity hash (matches ProgressTransition.integrityHash). */
  integrityHash: string;

  /** Pointers to the evidence items checked at attestation time. */
  evidenceManifest: EvidenceItemRef[];

  /** Free-form metadata (claim number, address, etc) for the carrier UI. */
  metadata?: Record<string, unknown>;
}

// ─── Build ───────────────────────────────────────────────────────────────────

/**
 * Caller supplies the data fetcher so this module stays free of a hard
 * Prisma dependency. The service layer wires a real implementation that
 * reads from prisma.progressTransition / progressAttestation / etc.
 */
export interface FetchDelegate {
  /** Returns null if the transition does not exist. */
  loadTransition(transitionId: string): Promise<TransitionData | null>;
}

export interface TransitionData {
  id: string;
  claimProgressId: string;
  transitionKey: string;
  transitionedAt: Date;
  integrityHash: string;
  guardSnapshot: Record<string, unknown> | null;
  attestor: AttestorIdentity;
  evidenceManifest: EvidenceItemRef[];
  origin?: string | null;
  metadata?: Record<string, unknown>;
}

export type BuildResult =
  | { ok: true; packet: StabilisationPacket }
  | { ok: false; error: string };

export async function buildStabilisationPacket(
  transitionId: string,
  delegate: FetchDelegate,
): Promise<BuildResult> {
  let row: TransitionData | null;
  try {
    row = await delegate.loadTransition(transitionId);
  } catch (err) {
    return {
      ok: false,
      error: `loadTransition threw: ${(err as Error).message ?? String(err)}`,
    };
  }

  if (!row) {
    return { ok: false, error: "transition not found" };
  }
  if (row.transitionKey !== "attest_stabilisation") {
    return {
      ok: false,
      error: `unsupported transitionKey: ${row.transitionKey}`,
    };
  }

  const packet: StabilisationPacket = {
    transitionId: row.id,
    claimProgressId: row.claimProgressId,
    transitionedAt: row.transitionedAt.toISOString(),
    origin: row.origin ?? null,
    attestor: row.attestor,
    guardSnapshot: row.guardSnapshot ?? {},
    integrityHash: row.integrityHash,
    evidenceManifest: row.evidenceManifest,
    metadata: row.metadata,
  };
  return { ok: true, packet };
}

// ─── Submit ──────────────────────────────────────────────────────────────────

const ENV_VAR_BY_CARRIER: Record<CarrierKey, string> = {
  guidewire: "GUIDEWIRE_SANDBOX_URL",
  youi: "YOUI_API_URL",
  hollard: "HOLLARD_API_URL",
};

const RESPONSE_ID_KEYS_BY_CARRIER: Record<CarrierKey, readonly string[]> = {
  guidewire: ["claimReference", "id", "publicId"],
  youi: ["caseId", "id", "reference"],
  hollard: ["claimNumber", "id", "submissionId"],
};

export type SubmitResult =
  | { ok: true; carrierRef: string; status: number }
  | { ok: false; error: string; status?: number };

export async function submitToCarrier(
  packet: StabilisationPacket,
  carrier: CarrierKey,
): Promise<SubmitResult> {
  const envVar = ENV_VAR_BY_CARRIER[carrier];
  const url = process.env[envVar]?.trim();
  if (!url) {
    return { ok: false, error: "carrier endpoint not configured" };
  }

  const idempotencyKey = `${packet.transitionId}:${carrier}`;

  let resp: Response;
  try {
    resp = await globalThis.fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ carrier, packet }),
    });
  } catch (err) {
    return {
      ok: false,
      error: `network error: ${(err as Error).message ?? String(err)}`,
    };
  }

  if (!resp.ok) {
    return {
      ok: false,
      error: `carrier responded with non-2xx`,
      status: resp.status,
    };
  }

  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    return {
      ok: false,
      error: "carrier response was not valid JSON",
      status: resp.status,
    };
  }

  const carrierRef = extractCarrierRef(body, carrier);
  if (!carrierRef) {
    return {
      ok: false,
      error: "carrier response missing reference id",
      status: resp.status,
    };
  }

  return { ok: true, carrierRef, status: resp.status };
}

function extractCarrierRef(body: unknown, carrier: CarrierKey): string | null {
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;
  for (const k of RESPONSE_ID_KEYS_BY_CARRIER[carrier]) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}
