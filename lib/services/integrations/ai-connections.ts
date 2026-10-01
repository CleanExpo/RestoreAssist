import { prisma } from "@/lib/prisma";
import {
  type AiProvider,
  type ProviderConnectionStatus,
} from "@/lib/workspace/provider-connections";

/** Configuration metadata only. ACTIVE does not assert live provider health. */
export interface ConfiguredAiConnectionMetadata {
  id: string;
  provider: AiProvider;
  status: ProviderConnectionStatus;
  lastValidatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConfiguredAiConnections {
  workspaceId: string | null;
  connections: ConfiguredAiConnectionMetadata[];
}

interface Dependencies {
  workspace: Pick<typeof prisma.workspace, "findFirst">;
  providerConnection: Pick<typeof prisma.providerConnection, "findMany">;
}

/**
 * Read the effective owner's READY workspace without provisioning anything.
 * An owner may also be a member of an unrelated tenant, so membership fallback
 * must not select that tenant's BYOK configuration.
 * No credential column is selected or decrypted, including for masked display.
 * Empty DISABLED rows are provisioned placeholders; an actual disconnect keeps
 * its encrypted credentials, so it remains authoritative over legacy records.
 */
export async function listConfiguredAiConnections(
  userId: string,
  dependencies: Dependencies = {
    workspace: prisma.workspace,
    providerConnection: prisma.providerConnection,
  },
): Promise<ConfiguredAiConnections> {
  const workspace = await dependencies.workspace.findFirst({
    where: { ownerId: userId, status: "READY" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!workspace) return { workspaceId: null, connections: [] };

  const rows = await dependencies.providerConnection.findMany({
    where: {
      workspaceId: workspace.id,
      OR: [
        { status: { not: "DISABLED" } },
        { encryptedCredentials: { not: "" } },
        { lastValidatedAt: { not: null } },
        { lastError: { not: null } },
      ],
    },
    select: {
      id: true,
      provider: true,
      status: true,
      lastValidatedAt: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: 6, // One row per workspace/provider; six providers in the schema.
  });

  return {
    workspaceId: workspace.id,
    connections: rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      status: row.status,
      lastValidatedAt: row.lastValidatedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
  };
}
