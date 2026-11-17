/**
 * RA-8439 — the one selection entry point for /api/integrations/oauth/[provider]/*.
 *
 * A user with two Integration rows for one provider used to be locked out of
 * every provider action: each route refused with an AMBIGUOUS 409 and none
 * accepted a way to choose. Every route now selects through this module, which
 * reads one optional input, `?integrationId=`, and owns the failure responses.
 *
 * The id is read from the query string, never the body: several routes read
 * the body after selection, and a request body can only be read once.
 * The id only narrows. userId and any workspace filter still apply, so a
 * caller can never select another user's row by naming its id.
 */
import type { NextRequest, NextResponse } from "next/server";
import type { PrismaClient } from "@prisma/client";
import { apiError } from "@/lib/api-errors";
import { selectOAuthIntegration, type SelectedOAuthIntegration } from "./select-oauth";

/** Re-exported so routes that create a row return the same identity shape. */
export { OAUTH_IDENTITY_SELECT } from "./select-oauth";

export const INTEGRATION_ID_PARAM = "integrationId";
const INTEGRATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export const AMBIGUOUS_SELECTION_MESSAGE =
  `Multiple connections exist for this provider. Send ?${INTEGRATION_ID_PARAM}=<id> to choose one.`;

type Db = Pick<PrismaClient, "integration">;
export type RequestSelection =
  | { integration: SelectedOAuthIntegration | null; response?: undefined }
  | { integration?: undefined; response: NextResponse };

/**
 * Select the caller's Integration row for this request. Returns
 * `{ integration: null }` only when no selection was requested and nothing
 * exists, so each route keeps its own not-found behaviour (connect creates a
 * row, the others return 404). A named id that is not found is always a 404.
 */
export async function selectOAuthIntegrationForRequest(
  request: NextRequest,
  input: { prisma: Db; userId: string; provider: string; workspaceId?: string | null; requireReady?: boolean },
): Promise<RequestSelection> {
  const raw = new URL(request.url).searchParams.get(INTEGRATION_ID_PARAM);
  const integrationId = raw === null || raw === "" ? undefined : raw;
  if (integrationId !== undefined && !INTEGRATION_ID_PATTERN.test(integrationId)) {
    return { response: apiError(request, { code: "VALIDATION", message: `Invalid ${INTEGRATION_ID_PARAM}.`, status: 400 }) };
  }
  const selection = await selectOAuthIntegration({ ...input, integrationId });
  if (selection.ok) return { integration: selection.data };
  switch (selection.reason) {
    case "NOT_FOUND":
      if (integrationId === undefined) return { integration: null };
      return { response: apiError(request, { code: "NOT_FOUND", message: "Integration not found", status: 404 }) };
    case "AMBIGUOUS":
      return { response: apiError(request, {
        code: "VALIDATION", message: AMBIGUOUS_SELECTION_MESSAGE, status: 409,
        fields: { [INTEGRATION_ID_PARAM]: "Required when more than one connection exists for this provider." },
      }) };
    case "NOT_READY":
      return { response: apiError(request, {
        code: "VALIDATION", status: 409,
        message: "This connection needs valid credentials and an authorised organisation before syncing.",
      }) };
    case "INVALID_PROVIDER":
      return { response: apiError(request, {
        code: "VALIDATION", status: 400, message: "This provider is not supported by the OAuth integration route.",
      }) };
  }
}

/** True when the user holds any row for the provider, in any workspace. */
export async function hasAnyOAuthIntegration(input: { prisma: Db; userId: string; provider: string }): Promise<boolean> {
  const existing = await selectOAuthIntegration({ ...input, requireReady: false });
  return existing.ok || existing.reason === "AMBIGUOUS";
}

/**
 * The OAuth callback has no user choice to read: the row is the one bound to
 * the validated one-time state. Kept here so the route family has one
 * selection module.
 */
export async function selectStateBoundOAuthIntegration(input: {
  prisma: Db; userId: string; provider: string; integrationId?: string; requireReady?: boolean;
}): Promise<SelectedOAuthIntegration | null> {
  const selection = await selectOAuthIntegration(input);
  return selection.ok ? selection.data : null;
}
