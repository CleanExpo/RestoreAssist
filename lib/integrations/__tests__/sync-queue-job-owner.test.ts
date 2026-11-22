/**
 * RA-8482: cancelJob, retryJob and getJobStatus used to act on any
 * InvoiceSyncJob by id. They now take the owner and check it through
 * Invoice.userId, so another user's job is refused exactly as a missing job
 * is (false / null), without revealing that the job exists.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Job = {
  id: string;
  invoiceId: string;
  provider: string;
  priority: string;
  status: string;
  retryCount: number;
  errorMessage: string | null;
  createdAt: Date;
};

const jobs = vi.hoisted(() => new Map<string, Job>());
const invoices = vi.hoisted(
  () => new Map<string, { id: string; userId: string }>(),
);

const findUnique = vi.hoisted(() =>
  vi.fn(async ({ where }: { where: { id: string } }) => {
    const job = jobs.get(where.id);
    return job ? { ...job } : null;
  }),
);
const updateMany = vi.hoisted(() =>
  vi.fn(
    async ({
      where,
      data,
    }: {
      where: { id: string; invoiceId?: string; status: string };
      data: Partial<Job>;
    }) => {
      const job = jobs.get(where.id);
      if (
        !job ||
        job.status !== where.status ||
        (where.invoiceId !== undefined && job.invoiceId !== where.invoiceId)
      ) {
        return { count: 0 };
      }
      Object.assign(job, data);
      return { count: 1 };
    },
  ),
);
const invoiceFindFirst = vi.hoisted(() =>
  vi.fn(async ({ where }: { where: { id: string; userId: string } }) => {
    const invoice = invoices.get(where.id);
    return invoice && invoice.userId === where.userId
      ? { id: invoice.id }
      : null;
  }),
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoiceSyncJob: { findUnique, updateMany },
    invoice: { findFirst: invoiceFindFirst },
  },
}));

import { cancelJob, getJobStatus, retryJob } from "../sync-queue";

function seed(status: string): void {
  invoices.set("inv-a", { id: "inv-a", userId: "user-a" });
  jobs.set("job-a", {
    id: "job-a",
    invoiceId: "inv-a",
    provider: "XERO",
    priority: "NORMAL",
    status,
    retryCount: 3,
    errorMessage: status === "FAILED" ? "boom" : null,
    createdAt: new Date("2026-11-01T00:00:00Z"),
  });
}

beforeEach(() => {
  jobs.clear();
  invoices.clear();
  vi.clearAllMocks();
});

describe("the owner can act on their own job", () => {
  it("cancels a pending job", async () => {
    seed("PENDING");
    expect(await cancelJob("job-a", "user-a")).toBe(true);
    expect(jobs.get("job-a")?.status).toBe("FAILED");
  });

  it("retries a failed job", async () => {
    seed("FAILED");
    expect(await retryJob("job-a", "user-a")).toBe(true);
    expect(jobs.get("job-a")).toMatchObject({
      status: "PENDING",
      retryCount: 0,
      errorMessage: null,
    });
  });

  it("reads the job status", async () => {
    seed("PENDING");
    expect(await getJobStatus("job-a", "user-a")).toMatchObject({
      id: "job-a",
      invoiceId: "inv-a",
      status: "PENDING",
    });
  });
});

describe("another user is refused as if the job did not exist", () => {
  it("cannot cancel it", async () => {
    seed("PENDING");
    expect(await cancelJob("job-a", "user-b")).toBe(false);
    expect(jobs.get("job-a")?.status).toBe("PENDING");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("cannot retry it", async () => {
    seed("FAILED");
    expect(await retryJob("job-a", "user-b")).toBe(false);
    expect(jobs.get("job-a")?.status).toBe("FAILED");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("cannot read it", async () => {
    seed("PENDING");
    expect(await getJobStatus("job-a", "user-b")).toBeNull();
  });

  it("is checked against Invoice.userId", async () => {
    seed("PENDING");
    await getJobStatus("job-a", "user-b");
    expect(invoiceFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "inv-a", userId: "user-b" } }),
    );
  });

  it("is refused when no owner is given", async () => {
    seed("PENDING");
    expect(await cancelJob("job-a", "")).toBe(false);
    expect(await getJobStatus("job-a", "")).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe("a missing job is refused", () => {
  it("returns false or null for all three functions", async () => {
    expect(await cancelJob("job-missing", "user-a")).toBe(false);
    expect(await retryJob("job-missing", "user-a")).toBe(false);
    expect(await getJobStatus("job-missing", "user-a")).toBeNull();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("refuses a job whose invoice no longer exists", async () => {
    seed("PENDING");
    invoices.clear();
    expect(await cancelJob("job-a", "user-a")).toBe(false);
    expect(await getJobStatus("job-a", "user-a")).toBeNull();
  });
});
