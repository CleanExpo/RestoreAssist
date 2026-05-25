interface OfflineMutationRow {
  id: string;
  type: string;
  endpoint: string;
  method: string;
  body: string;
  inspectionId: string | null;
  status: "pending" | "processing" | "failed";
  retryCount: number;
  queuedAt: string;
  lastAttemptAt: string | null;
  lastError: string | null;
}

const databases = new Map<string, Map<string, OfflineMutationRow>>();

function getRows(dbName: string): Map<string, OfflineMutationRow> {
  let rows = databases.get(dbName);
  if (!rows) {
    rows = new Map();
    databases.set(dbName, rows);
  }
  return rows;
}

function cloneRow(row: OfflineMutationRow): OfflineMutationRow {
  return { ...row };
}

function statusCounts(rows: Iterable<OfflineMutationRow>) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([status, count]) => ({
    status,
    count,
  }));
}

export async function openDatabaseAsync(dbName: string) {
  const rows = getRows(dbName);

  return {
    async execAsync() {},

    async runAsync(sql: string, ...params: unknown[]) {
      if (sql.includes("INSERT INTO offline_mutations")) {
        if (rows.has(params[0] as string)) {
          throw new Error("SQLITE_CONSTRAINT_PRIMARYKEY");
        }
        rows.set(params[0] as string, {
          id: params[0] as string,
          type: params[1] as string,
          endpoint: params[2] as string,
          method: params[3] as string,
          body: params[4] as string,
          inspectionId: params[5] as string | null,
          status: params[6] as OfflineMutationRow["status"],
          retryCount: params[7] as number,
          queuedAt: params[8] as string,
          lastAttemptAt: params[9] as string | null,
          lastError: params[10] as string | null,
        });
        return;
      }

      if (sql.includes("DELETE FROM offline_mutations WHERE id = ?")) {
        rows.delete(params[0] as string);
        return;
      }

      if (sql.includes("SET status = 'pending'")) {
        const cutoff = params[0] as string;
        for (const row of rows.values()) {
          if (
            row.status === "processing" &&
            (row.lastAttemptAt === null || row.lastAttemptAt < cutoff)
          ) {
            row.status = "pending";
            row.lastError = "Recovered after interrupted sync";
          }
        }
        return;
      }

      if (sql.includes("SET status = 'processing'")) {
        const row = rows.get(params[1] as string);
        if (row) {
          row.status = "processing";
          row.lastAttemptAt = params[0] as string;
          row.lastError = null;
        }
        return;
      }

      if (sql.includes("SET status = ?, retryCount = ?")) {
        const row = rows.get(params[4] as string);
        if (row) {
          row.status = params[0] as OfflineMutationRow["status"];
          row.retryCount = params[1] as number;
          row.lastAttemptAt = params[2] as string;
          row.lastError = params[3] as string;
        }
      }

      if (sql.includes("SET status = 'failed', retryCount = ?")) {
        const row = rows.get(params[3] as string);
        if (row) {
          row.status = "failed";
          row.retryCount = params[0] as number;
          row.lastAttemptAt = params[1] as string;
          row.lastError = params[2] as string;
        }
      }
    },

    async getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null> {
      if (sql.includes("WHERE id = ?")) {
        const row = rows.get(params[0] as string);
        return row ? (cloneRow(row) as T) : null;
      }
      return null;
    },

    async getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      if (sql.includes("GROUP BY status")) {
        return statusCounts(rows.values()) as T[];
      }

      const list = Array.from(rows.values()).sort((a, b) =>
        a.queuedAt.localeCompare(b.queuedAt),
      );

      if (sql.includes("WHERE status = ?")) {
        return list
          .filter((row) => row.status === params[0])
          .map(cloneRow) as T[];
      }

      return list.map(cloneRow) as T[];
    },
  };
}

export function __resetExpoSqliteMock(): void {
  databases.clear();
}
