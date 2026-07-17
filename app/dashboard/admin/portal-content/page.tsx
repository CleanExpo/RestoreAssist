"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ChromeArrowLeft, ChromeRefresh } from "@/components/brand/chrome-icons";
import { RAIcon } from "@/components/brand/RAIcon";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge, type StatusTone } from "@/components/StatusBadge";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import toast from "react-hot-toast";

interface PortalContentItem {
  id: string;
  scope: string;
  audience: string;
  category: string;
  slug: string;
  state: string;
  publishedAt: string | null;
  updatedAt: string;
}

function stateTone(state: string): StatusTone {
  if (state === "PUBLISHED") return "success";
  if (state === "DRAFT") return "neutral";
  return "warning";
}

export default function PortalContentAdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const confirmDialog = useConfirmDialog();
  const [items, setItems] = useState<PortalContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [slug, setSlug] = useState("");
  const [category, setCategory] = useState("faq");
  const [mdxContent, setMdxContent] = useState("## Title\n\nBody copy here.");

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/portal-content");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { items: PortalContentItem[] };
      setItems(data.items);
    } catch (err) {
      setLoadError("Could not load portal content");
      console.error("[portal-content admin]", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) {
      router.replace("/login");
      return;
    }
    if ((session.user as { role?: string }).role !== "ADMIN") {
      router.replace("/dashboard");
      return;
    }
    load();
  }, [session, status, router, load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/portal-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, category, mdxContent, state: "DRAFT" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSlug("");
      setMdxContent("## Title\n\nBody copy here.");
      await load();
    } catch (err) {
      console.error("[portal-content create]", err);
      setLoadError("Create failed — check slug is unique");
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish(item: PortalContentItem) {
    const nextState = item.state === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    try {
      const res = await fetch(`/api/admin/portal-content/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: nextState }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(
        nextState === "PUBLISHED" ? "Article published" : "Article unpublished",
      );
      await load();
    } catch (err) {
      console.error("[portal-content publish]", err);
      toast.error("Could not update publish state");
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirmDialog.ask({
      title: "Delete this article?",
      description: "The article is removed from the client portal. This action cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/portal-content/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("Article deleted");
      await load();
    } catch (err) {
      console.error("[portal-content delete]", err);
      toast.error("Could not delete article");
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div>
        <a
          href="/dashboard/admin"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4"
        >
          <ChromeArrowLeft size={12} />
          Back to admin
        </a>
        <h1 className="text-2xl font-semibold">Portal content hub</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage customer-facing help articles shown on the client portal.
          Publish only content you are licensed to share — defaults ship when
          the org has not authored articles yet.
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>
            Published:{" "}
            <strong className="text-foreground">
              {items.filter((i) => i.state === "PUBLISHED").length}
            </strong>
          </span>
          <span>
            Drafts:{" "}
            <strong className="text-foreground">
              {items.filter((i) => i.state === "DRAFT").length}
            </strong>
          </span>
        </div>
      </div>

      {loadError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="text-destructive">{loadError}</p>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={load}>
            <ChromeRefresh className="mr-2 h-4 w-4" /> Retry
          </Button>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Create article</CardTitle>
          <CardDescription>
            Slug must be unique per scope. Use markdown headings (##) for sections.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="faq-water-damage"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="faq"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mdxContent">Content (markdown)</Label>
              <Textarea
                id="mdxContent"
                value={mdxContent}
                onChange={(e) => setMdxContent(e.target.value)}
                rows={8}
                required
              />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" /> Saving…
                </>
              ) : (
                "Create draft"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Articles</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="h-4 w-4" /> Loading…
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<RAIcon name="report" size={40} decorative className="h-10 w-10" />}
              title="No portal articles yet"
              description="Create a draft FAQ or help article. Until you publish org content, the client portal shows built-in defaults."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Slug</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">{item.slug}</TableCell>
                    <TableCell>{item.category}</TableCell>
                    <TableCell>
                      <StatusBadge tone={stateTone(item.state)}>
                        {item.state}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => togglePublish(item)}
                      >
                        {item.state === "PUBLISHED" ? "Unpublish" : "Publish"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(item.id)}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <confirmDialog.Mount />
    </div>
  );
}
