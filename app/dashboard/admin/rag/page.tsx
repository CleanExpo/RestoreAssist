"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { RAIcon } from "@/components/brand/RAIcon";

interface TierRow {
  kind: string;
  provenance: string;
  chunks: number;
}

interface StatusData {
  total: number;
  byTier: TierRow[];
}

interface IngestResult {
  standard: string;
  edition: string;
  filesProcessed: number;
  chunksUpserted: number;
  chunksSkipped: number;
}

export default function AdminRagPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [standard, setStandard] = useState("S500");
  const [edition, setEdition] = useState("2021");
  const [fileName, setFileName] = useState("paste.txt");
  const [text, setText] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<IngestResult | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);

  const [probeQ, setProbeQ] = useState("");
  const [probeResult, setProbeResult] = useState<unknown>(null);
  const [probing, setProbing] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/rag/status");
      if (!res.ok) {
        setData(null);
        setLoadError("Failed to load RAG corpus status");
        return;
      }
      setData(await res.json());
    } catch {
      setData(null);
      setLoadError("Failed to load RAG corpus status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (session?.user?.role !== "ADMIN") {
      router.push("/dashboard");
      return;
    }
    void fetchStatus();
  }, [status, session, router, fetchStatus]);

  const handleIngest = async () => {
    setIngesting(true);
    setIngestError(null);
    setIngestResult(null);
    try {
      const res = await fetch("/api/admin/rag/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          standard,
          edition,
          provenance: "authoritative-standard",
          jurisdiction: "AU",
          files: [{ name: fileName || "paste.txt", text }],
        }),
      });
      if (!res.ok) {
        setIngestError("Ingest failed");
        return;
      }
      setIngestResult(await res.json());
      await fetchStatus();
    } catch {
      setIngestError("Ingest failed");
    } finally {
      setIngesting(false);
    }
  };

  const handleProbe = async () => {
    if (!probeQ.trim()) return;
    setProbing(true);
    setProbeResult(null);
    try {
      const res = await fetch(
        `/api/admin/rag/probe?q=${encodeURIComponent(probeQ.trim())}`,
      );
      if (!res.ok) {
        setProbeResult({ error: "Probe failed" });
        return;
      }
      setProbeResult(await res.json());
    } catch {
      setProbeResult({ error: "Probe failed" });
    } finally {
      setProbing(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="p-8 text-neutral-500 dark:text-slate-400">
        Loading RAG admin…
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">
          RAG corpus (IICRC)
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          Operator ingest and health for the pgvector standards corpus. Paste
          plain text extracted from licensed PDFs — never commit verbatim
          standards into git.
        </p>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {loadError}
          <button
            type="button"
            className="ml-3 underline"
            onClick={() => void fetchStatus()}
          >
            Retry
          </button>
        </div>
      )}

      {data && !loadError && data.total === 0 && (
        <EmptyState
          icon={<RAIcon name="ai" size={40} decorative className="h-10 w-10" />}
          title="Corpus is empty"
          description="Ingest licensed plain-text extracts below. Probe will return nothing until chunks exist — we never invent retrieval hits."
        />
      )}

      {data && !loadError && data.total > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-neutral-500">
                Total chunks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <p className="text-3xl font-bold">{data.total}</p>
                <StatusBadge tone="success">Healthy</StatusBadge>
              </div>
            </CardContent>
          </Card>
          {data.byTier.slice(0, 2).map((row) => (
            <Card key={`${row.kind}-${row.provenance}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-neutral-500">
                  {row.kind} / {row.provenance}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{row.chunks}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {data && !loadError && data.total > 0 && data.byTier.length > 2 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">All tiers</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-1 text-muted-foreground">
              {data.byTier.map((row) => (
                <li
                  key={`${row.kind}-${row.provenance}`}
                  className="flex justify-between gap-4"
                >
                  <span>
                    {row.kind} / {row.provenance}
                  </span>
                  <span className="tabular-nums font-medium text-foreground">
                    {row.chunks}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Ingest plain text</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="standard">Standard</Label>
              <Input
                id="standard"
                value={standard}
                onChange={(e) => setStandard(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="edition">Edition</Label>
              <Input
                id="edition"
                value={edition}
                onChange={(e) => setEdition(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="fileName">File name</Label>
              <Input
                id="fileName"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="text">Extracted text</Label>
            <textarea
              id="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              className="mt-1 w-full rounded-md border border-neutral-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
              placeholder="Paste pdftotext output here…"
            />
          </div>
          {ingestError && (
            <p className="text-sm text-destructive">{ingestError}</p>
          )}
          {ingestResult && (
            <p className="text-sm text-success">
              Upserted {ingestResult.chunksUpserted}, skipped{" "}
              {ingestResult.chunksSkipped} across {ingestResult.filesProcessed}{" "}
              file(s).
            </p>
          )}
          <Button
            type="button"
            disabled={ingesting || !text.trim()}
            onClick={() => void handleIngest()}
          >
            {ingesting ? "Ingesting…" : "Run ingest"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Retrieval probe</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={probeQ}
              onChange={(e) => setProbeQ(e.target.value)}
              placeholder="e.g. Category 3 water drying goals"
            />
            <Button
              type="button"
              variant="outline"
              disabled={probing || !probeQ.trim()}
              onClick={() => void handleProbe()}
            >
              {probing ? "…" : "Probe"}
            </Button>
          </div>
          {probeResult != null && (
            <pre className="text-xs overflow-auto max-h-64 rounded border border-neutral-200 dark:border-slate-700 p-3 bg-neutral-50 dark:bg-slate-900">
              {JSON.stringify(probeResult, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
