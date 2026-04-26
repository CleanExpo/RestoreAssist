/**
 * Claim detail — RA-1704.
 *
 * Per-claim page showing current state, legal next transitions (filtered
 * by the user's progress role), recent transition history, and
 * attestations. The interactive controls (transition buttons + Pi-Sign
 * SignaturePad) live in a client component.
 */

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  legalKeysFrom,
  type TransitionKey,
} from "@/lib/progress/state-machine";
import {
  canPerformTransition,
  resolveProgressRole,
} from "@/lib/progress/permissions";
import ClaimActions, {
  type LegalAction,
} from "@/components/progress/ClaimActions";

export const metadata = {
  title: "Claim — RestoreAssist",
};

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ reportId: string }>;
}

// Action labelling and attestation requirement per transition key.
// Only attestation-bearing transitions get the SignaturePad surface.
const ACTION_META: Record<
  string,
  {
    label: string;
    requiresAttestation?: boolean;
    attestationType?: LegalAction["attestationType"];
  }
> = {
  start_stabilisation: { label: "Start stabilisation" },
  attest_stabilisation: {
    label: "Attest stabilisation",
    requiresAttestation: true,
    attestationType: "TECHNICIAN_SIGN_OFF",
  },
  whs_incident_raised: { label: "Raise WHS incident" },
  whs_cleared: { label: "Clear WHS hold" },
  begin_scope: { label: "Begin scope" },
  approve_scope: {
    label: "Approve scope",
    requiresAttestation: true,
    attestationType: "MANAGER_COUNTERSIGN",
  },
  commence_drying: { label: "Commence drying" },
  raise_variation: { label: "Raise variation" },
  variation_approved: { label: "Approve variation" },
  variation_rejected: { label: "Reject variation" },
  certify_drying: {
    label: "Certify drying",
    requiresAttestation: true,
    attestationType: "TECHNICIAN_SIGN_OFF",
  },
  initiate_closeout: { label: "Initiate closeout" },
  issue_invoice: {
    label: "Issue invoice",
    requiresAttestation: true,
    attestationType: "MANAGER_COUNTERSIGN",
  },
  reopen_drying: { label: "Reopen drying" },
  record_payment: { label: "Record payment" },
  raise_dispute: { label: "Raise dispute" },
  dispute_resolved: { label: "Resolve dispute" },
  write_off: { label: "Write off" },
  close_claim: { label: "Close claim" },
  withdraw: { label: "Withdraw" },
};

export default async function ClaimDetailPage({ params }: Props) {
  const { reportId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const cp = await prisma.claimProgress.findUnique({
    where: { reportId },
    select: {
      id: true,
      reportId: true,
      currentState: true,
      previousState: true,
      version: true,
      closedAt: true,
      createdAt: true,
      updatedAt: true,
      report: {
        select: {
          id: true,
          userId: true,
          title: true,
          propertyAddress: true,
          hazardType: true,
          insuranceType: true,
        },
      },
    },
  });
  if (!cp) notFound();

  const role = (session.user as { role?: string }).role ?? "USER";
  const isAdmin = role === "ADMIN";

  // Tenancy: report owner OR admin can view.
  if (cp.report.userId !== userId && !isAdmin) {
    redirect("/dashboard/claims");
  }

  // Resolve effective progress role for this user. Reads
  // isJuniorTechnician fresh from the DB (RA-1443 ring-fence).
  const userRow = await prisma.user.findUnique({
    where: { id: userId },
    select: { isJuniorTechnician: true },
  });
  const progressRole = resolveProgressRole({
    userRole: role,
    isJuniorTechnician: userRow?.isJuniorTechnician ?? false,
  });

  const legalKeys = legalKeysFrom(cp.currentState);
  const allowedKeys = legalKeys.filter((k) =>
    canPerformTransition(progressRole, cp.currentState, k),
  );
  const actions: LegalAction[] = allowedKeys.map((k) => ({
    key: k,
    label: ACTION_META[k]?.label ?? k,
    requiresAttestation: ACTION_META[k]?.requiresAttestation,
    attestationType: ACTION_META[k]?.attestationType,
  }));

  const [recentTransitions, recentAttestations] = await Promise.all([
    prisma.progressTransition.findMany({
      where: { claimProgressId: cp.id },
      orderBy: { transitionedAt: "desc" },
      take: 25,
      select: {
        id: true,
        transitionKey: true,
        fromState: true,
        toState: true,
        actorName: true,
        actorRole: true,
        transitionedAt: true,
        softGaps: true,
        auditGaps: true,
      },
    }),
    prisma.progressAttestation.findMany({
      where: { claimProgressId: cp.id },
      orderBy: { attestedAt: "desc" },
      take: 10,
      select: {
        id: true,
        attestationType: true,
        attestorName: true,
        attestorRole: true,
        attestedAt: true,
        signatureDataUrl: true,
      },
    }),
  ]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div>
        <Link
          href="/dashboard/claims"
          className="text-sm text-blue-600 hover:underline"
        >
          ← All claims
        </Link>
      </div>

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">
          {cp.report.propertyAddress || cp.report.title || "Claim"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {cp.report.hazardType} · {cp.report.insuranceType}
        </p>
        <div className="flex gap-3 items-center text-sm pt-1">
          <span className="font-mono rounded bg-muted px-2 py-0.5">
            {cp.currentState}
          </span>
          {cp.closedAt ? (
            <span className="text-muted-foreground">
              Closed {new Date(cp.closedAt).toISOString().slice(0, 10)}
            </span>
          ) : (
            <span className="text-muted-foreground">
              Updated {new Date(cp.updatedAt).toISOString().slice(0, 10)} ·
              v{cp.version}
            </span>
          )}
        </div>
      </header>

      {!cp.closedAt ? (
        <section className="space-y-2">
          <h2 className="text-lg font-medium">Next steps</h2>
          <ClaimActions
            reportId={cp.reportId}
            expectedVersion={cp.version}
            actions={actions}
          />
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Recent transitions</h2>
        {recentTransitions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No transitions recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left">When</th>
                  <th className="px-3 py-2 text-left">Action</th>
                  <th className="px-3 py-2 text-left">From → To</th>
                  <th className="px-3 py-2 text-left">Actor</th>
                  <th className="px-3 py-2 text-left">Gaps</th>
                </tr>
              </thead>
              <tbody>
                {recentTransitions.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(t.transitionedAt).toISOString().slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {t.transitionKey}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {t.fromState} → {t.toState}
                    </td>
                    <td className="px-3 py-2">
                      {t.actorName}{" "}
                      <span className="text-muted-foreground text-xs">
                        ({t.actorRole})
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <GapBadges
                        soft={Array.isArray(t.softGaps) ? (t.softGaps as string[]) : []}
                        audit={Array.isArray(t.auditGaps) ? (t.auditGaps as string[]) : []}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {recentAttestations.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-lg font-medium">Attestations</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {recentAttestations.map((a) => (
              <div
                key={a.id}
                className="rounded-md border p-3 flex gap-3 items-start"
              >
                {a.signatureDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.signatureDataUrl}
                    alt="signature"
                    className="border rounded bg-white"
                    width={120}
                    height={50}
                    style={{ objectFit: "contain" }}
                  />
                ) : (
                  <div className="w-[120px] h-[50px] border rounded bg-muted/50 grid place-items-center text-xs text-muted-foreground">
                    no sig
                  </div>
                )}
                <div className="text-sm">
                  <div className="font-medium">{a.attestationType}</div>
                  <div className="text-muted-foreground text-xs">
                    {a.attestorName} ({a.attestorRole})
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {new Date(a.attestedAt).toISOString().slice(0, 16).replace("T", " ")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function GapBadges({ soft, audit }: { soft: string[]; audit: string[] }) {
  if (soft.length === 0 && audit.length === 0) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {soft.map((k) => (
        <span
          key={`s-${k}`}
          className="rounded bg-amber-50 text-amber-800 text-[10px] font-mono px-1.5 py-0.5"
        >
          soft:{k.replace(/^evidence\./, "")}
        </span>
      ))}
      {audit.map((k) => (
        <span
          key={`a-${k}`}
          className="rounded bg-zinc-50 text-zinc-700 text-[10px] font-mono px-1.5 py-0.5"
        >
          audit:{k.replace(/^evidence\./, "")}
        </span>
      ))}
    </div>
  );
}
