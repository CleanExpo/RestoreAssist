"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import Fuse from "fuse.js";
import { HELP_CATEGORY_LABELS, type HelpCategory } from "@/lib/help/types";

type IndexEntry = {
  slug: string;
  category: HelpCategory;
  title: string;
  audience: string[];
  aiSummary: string;
  userIntents: string[];
  readTimeMin: number;
};

export default function HelpSearchModal() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<IndexEntry[]>([]);

  // Open on Cmd-K / Ctrl-K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Load index on first open
  useEffect(() => {
    if (open && index.length === 0) {
      fetch("/help-index.json")
        .then((r) => r.json())
        .then((data) => setIndex(data))
        .catch(() => setIndex([]));
    }
  }, [open, index.length]);

  const fuse = useMemo(
    () =>
      new Fuse(index, {
        keys: ["title", "aiSummary", "userIntents"],
        threshold: 0.4,
        includeScore: false,
      }),
    [index],
  );

  const results = useMemo(() => {
    if (!query.trim()) return index.slice(0, 7);
    return fuse.search(query).slice(0, 7).map((r) => r.item);
  }, [query, index, fuse]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[15vh]"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="w-full max-w-2xl rounded-lg border border-white/10 bg-brand-surface shadow-2xl">
        <input
          autoFocus
          type="search"
          placeholder="Search help articles…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-t-lg border-b border-white/10 bg-transparent px-6 py-4 text-base text-white placeholder:text-white/40 focus:outline-none"
        />
        <ul className="max-h-[60vh] overflow-y-auto">
          {results.length === 0 && (
            <li className="px-6 py-8 text-center text-sm text-white/50">
              No results for "{query}". Try a different phrase.
            </li>
          )}
          {results.map((r) => (
            <li key={`${r.category}/${r.slug}`}>
              <Link
                href={`/dashboard/help/${r.category}/${r.slug}`}
                onClick={() => setOpen(false)}
                className="block border-b border-white/5 px-6 py-4 hover:bg-white/5"
              >
                <div className="text-xs text-white/50">{HELP_CATEGORY_LABELS[r.category]}</div>
                <div className="mt-1 text-sm font-medium text-white">{r.title}</div>
                <div className="mt-1 text-xs text-white/60 line-clamp-1">{r.aiSummary}</div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
