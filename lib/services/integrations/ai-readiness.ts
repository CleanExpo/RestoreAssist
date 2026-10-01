import { prisma } from "@/lib/prisma";
import { getOrganizationOwner } from "@/lib/organization-credits";
import { classifyIntegrationIdentity } from "@/lib/integrations/identity";
import { OPERATING_PROVIDERS } from "@/lib/workspace/provider-connections";
import { listConfiguredAiConnections } from "./ai-connections";

interface Dependencies {
  getOrganizationOwner: typeof getOrganizationOwner;
  listConfiguredAiConnections: typeof listConfiguredAiConnections;
  integration: Pick<typeof prisma.integration, "findMany">;
}

/**
 * Configuration presence only, never live validity. Match the credential
 * reader's organisation-owner scope and canonical per-provider precedence.
 * Read no credential values, including legacy plaintext keys or masked keys.
 */
export async function hasConfiguredAi(
  userId: string,
  dependencies: Dependencies = {
    getOrganizationOwner,
    listConfiguredAiConnections,
    integration: prisma.integration,
  },
): Promise<boolean> {
  const ownerId = (await dependencies.getOrganizationOwner(userId)) || userId;
  const canonical = await dependencies.listConfiguredAiConnections(ownerId);
  const operating = canonical.connections.filter((connection) =>
    OPERATING_PROVIDERS.includes(connection.provider),
  );
  if (operating.some((connection) => connection.status === "ACTIVE")) return true;

  // A configured failed/disabled row suppresses only that provider's legacy
  // record. Untouched provisioning placeholders are excluded by the reader.
  const configured = new Set(operating.map((connection) => connection.provider));
  const legacy = await dependencies.integration.findMany({
    where: {
      userId: ownerId,
      status: "CONNECTED",
      apiKey: { not: null },
      NOT: { apiKey: "" },
    },
    select: { id: true, provider: true, name: true, icon: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return legacy.some((row) => {
    const identity = classifyIntegrationIdentity(row);
    if (identity.kind !== "AI" || !identity.provider) return false;
    const provider = identity.provider === "GEMINI" ? "GOOGLE" : identity.provider;
    return !configured.has(provider);
  });
}
