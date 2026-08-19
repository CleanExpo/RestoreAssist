import { prisma } from "@/lib/prisma";
import type {
  ExternalDataSource,
  SyncedClientRow,
  SyncedJobRow,
} from "./types";

export interface SyncedListParams {
  userId: string;
  source: ExternalDataSource;
  page: number;
  limit: number;
  search?: string;
}

export interface SyncedListResult<T> {
  connected: boolean;
  items: T[];
  total: number;
  message?: string;
}

function formatAscoraAddress(parts: {
  address?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
}): string | null {
  const line = [
    parts.address?.trim(),
    [parts.suburb, parts.state, parts.postcode]
      .filter(Boolean)
      .join(" ")
      .trim(),
  ]
    .filter(Boolean)
    .join(", ");
  return line || null;
}

async function listXeroClients(
  params: SyncedListParams,
): Promise<SyncedListResult<SyncedClientRow>> {
  const integration = await prisma.integration.findFirst({
    where: { userId: params.userId, provider: "XERO" },
    select: { id: true },
  });

  if (!integration) {
    return {
      connected: false,
      items: [],
      total: 0,
      message: "Connect and sync Xero from Integrations first.",
    };
  }

  const search = params.search?.trim();
  const where = {
    integrationId: integration.id,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search, mode: "insensitive" as const } },
            { address: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.externalClient.findMany({
      where,
      skip: (params.page - 1) * params.limit,
      take: params.limit,
      orderBy: { name: "asc" },
    }),
    prisma.externalClient.count({ where }),
  ]);

  return {
    connected: true,
    total,
    items: rows.map((row) => ({
      id: row.id,
      externalId: row.externalId,
      source: "xero" as const,
      name: row.name,
      email: row.email,
      phone: row.phone,
      address: row.address,
      importedNativeId: row.contactId,
      jobCount: null,
      lastSyncedAt: row.lastSyncedAt.toISOString(),
      canImport: !row.contactId,
    })),
  };
}

/**
 * Ascora does not persist a customer table. Client rows are derived from
 * HistoricalJob.customerName written during Ascora sync (site/billing customer).
 */
async function listAscoraClients(
  params: SyncedListParams,
): Promise<SyncedListResult<SyncedClientRow>> {
  const integration = await prisma.ascoraIntegration.findUnique({
    where: { userId: params.userId },
    select: { id: true, isActive: true },
  });

  if (!integration) {
    return {
      connected: false,
      items: [],
      total: 0,
      message: "Connect and sync Ascora from Integrations first.",
    };
  }

  const search = params.search?.trim().toLowerCase();
  const jobs = await prisma.historicalJob.findMany({
    where: {
      tenantId: params.userId,
      source: "ascora",
      customerName: { not: null },
    },
    select: {
      id: true,
      externalId: true,
      customerName: true,
      address: true,
      suburb: true,
      state: true,
      postcode: true,
      completedDate: true,
      updatedAt: true,
    },
    orderBy: { completedDate: "desc" },
    take: 5000,
  });

  const byName = new Map<
    string,
    {
      id: string;
      externalId: string;
      name: string;
      address: string | null;
      jobCount: number;
      lastSyncedAt: Date;
    }
  >();

  for (const job of jobs) {
    const name = job.customerName?.trim();
    if (!name) continue;
    if (search && !name.toLowerCase().includes(search)) continue;

    const existing = byName.get(name.toLowerCase());
    if (existing) {
      existing.jobCount += 1;
      if (job.updatedAt > existing.lastSyncedAt) {
        existing.lastSyncedAt = job.updatedAt;
      }
      continue;
    }

    byName.set(name.toLowerCase(), {
      id: `ascora-customer:${job.externalId}`,
      externalId: job.externalId,
      name,
      address: formatAscoraAddress(job),
      jobCount: 1,
      lastSyncedAt: job.updatedAt,
    });
  }

  const all = Array.from(byName.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "en-AU"),
  );
  const total = all.length;
  const pageSlice = all.slice(
    (params.page - 1) * params.limit,
    params.page * params.limit,
  );

  return {
    connected: true,
    total,
    items: pageSlice.map((row) => ({
      id: row.id,
      externalId: row.externalId,
      source: "ascora" as const,
      name: row.name,
      email: null,
      phone: null,
      address: row.address,
      importedNativeId: null,
      jobCount: row.jobCount,
      lastSyncedAt: row.lastSyncedAt.toISOString(),
      canImport: false,
    })),
  };
}

async function listXeroJobs(
  params: SyncedListParams,
): Promise<SyncedListResult<SyncedJobRow>> {
  const integration = await prisma.integration.findFirst({
    where: { userId: params.userId, provider: "XERO" },
    select: { id: true },
  });

  if (!integration) {
    return {
      connected: false,
      items: [],
      total: 0,
      message: "Connect and sync Xero from Integrations first.",
    };
  }

  const search = params.search?.trim();
  const where = {
    integrationId: integration.id,
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" as const } },
            { address: { contains: search, mode: "insensitive" as const } },
            {
              description: { contains: search, mode: "insensitive" as const },
            },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.externalJob.findMany({
      where,
      skip: (params.page - 1) * params.limit,
      take: params.limit,
      orderBy: { lastSyncedAt: "desc" },
    }),
    prisma.externalJob.count({ where }),
  ]);

  // Resolve client names for display when clientExternalId is present.
  const clientIds = [
    ...new Set(
      rows
        .map((r) => r.clientExternalId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const clients =
    clientIds.length > 0
      ? await prisma.externalClient.findMany({
          where: {
            integrationId: integration.id,
            externalId: { in: clientIds },
          },
          select: { externalId: true, name: true },
          take: clientIds.length,
        })
      : [];
  const clientNameByExternalId = new Map(
    clients.map((c) => [c.externalId, c.name]),
  );

  return {
    connected: true,
    total,
    items: rows.map((row) => ({
      id: row.id,
      externalId: row.externalId,
      source: "xero" as const,
      title: row.title,
      status: row.status,
      clientName: row.clientExternalId
        ? (clientNameByExternalId.get(row.clientExternalId) ?? null)
        : null,
      address: row.address,
      description: row.description,
      claimType: null,
      totalExTax: null,
      completedAt: null,
      importedNativeId: row.claimId,
      lastSyncedAt: row.lastSyncedAt.toISOString(),
      canImport: !row.claimId,
    })),
  };
}

async function listAscoraJobs(
  params: SyncedListParams,
): Promise<SyncedListResult<SyncedJobRow>> {
  const integration = await prisma.ascoraIntegration.findUnique({
    where: { userId: params.userId },
    select: { id: true },
  });

  if (!integration) {
    return {
      connected: false,
      items: [],
      total: 0,
      message: "Connect and sync Ascora from Integrations first.",
    };
  }

  const search = params.search?.trim();
  const where = {
    tenantId: params.userId,
    source: "ascora",
    ...(search
      ? {
          OR: [
            { jobName: { contains: search, mode: "insensitive" as const } },
            { jobNumber: { contains: search, mode: "insensitive" as const } },
            {
              customerName: { contains: search, mode: "insensitive" as const },
            },
            { address: { contains: search, mode: "insensitive" as const } },
            { suburb: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.historicalJob.findMany({
      where,
      skip: (params.page - 1) * params.limit,
      take: params.limit,
      orderBy: [{ completedDate: "desc" }, { updatedAt: "desc" }],
    }),
    prisma.historicalJob.count({ where }),
  ]);

  // Prefer HistoricalJob (richer browse fields). If none yet but AscoraJob
  // rows exist (partial sync), fall back so the page is not empty.
  if (total === 0) {
    const ascoraWhere = {
      integrationId: integration.id,
      ...(search
        ? {
            OR: [
              {
                ascoraJobNumber: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              {
                jobType: { contains: search, mode: "insensitive" as const },
              },
              {
                suburb: { contains: search, mode: "insensitive" as const },
              },
            ],
          }
        : {}),
    };
    const [ascoraRows, ascoraTotal] = await Promise.all([
      prisma.ascoraJob.findMany({
        where: ascoraWhere,
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        orderBy: { completedAt: "desc" },
      }),
      prisma.ascoraJob.count({ where: ascoraWhere }),
    ]);

    if (ascoraTotal > 0) {
      return {
        connected: true,
        total: ascoraTotal,
        items: ascoraRows.map((row) => ({
          id: row.id,
          externalId: row.ascoraJobId,
          source: "ascora" as const,
          title: row.ascoraJobNumber || `Job ${row.ascoraJobId}`,
          status: row.completedAt ? "COMPLETED" : null,
          clientName: null,
          address: formatAscoraAddress(row),
          description: row.jobType,
          claimType: row.claimType,
          totalExTax: row.totalExTax,
          completedAt: row.completedAt?.toISOString() ?? null,
          importedNativeId: null,
          lastSyncedAt: row.importedAt.toISOString(),
          canImport: false,
        })),
      };
    }
  }

  return {
    connected: true,
    total,
    items: rows.map((row) => ({
      id: row.id,
      externalId: row.externalId,
      source: "ascora" as const,
      title: row.jobName || row.jobNumber,
      status: row.completedDate ? "COMPLETED" : null,
      clientName: row.customerName,
      address: formatAscoraAddress(row),
      description: row.description?.slice(0, 280) || null,
      claimType: row.claimType,
      totalExTax: row.totalExTax,
      completedAt: row.completedDate?.toISOString() ?? null,
      importedNativeId: null,
      lastSyncedAt: row.updatedAt.toISOString(),
      canImport: false,
    })),
  };
}

export async function listSyncedClients(
  params: SyncedListParams,
): Promise<SyncedListResult<SyncedClientRow>> {
  return params.source === "xero"
    ? listXeroClients(params)
    : listAscoraClients(params);
}

export async function listSyncedJobs(
  params: SyncedListParams,
): Promise<SyncedListResult<SyncedJobRow>> {
  return params.source === "xero"
    ? listXeroJobs(params)
    : listAscoraJobs(params);
}
