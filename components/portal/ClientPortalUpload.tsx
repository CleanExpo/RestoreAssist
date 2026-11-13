"use client";

import { useState } from "react";
import {
  clientPortalPanelPadding,
  clientPortalPrimaryLink,
} from "@/lib/portal/client-portal-theme";

const MAX_IMAGES = 10;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function ClientPortalUpload({ token }: { token: string }) {
  const [images, setImages] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_IMAGES);
    const dataUrls = await Promise.all(files.map(readAsDataUrl));
    setImages((prev) => [...prev, ...dataUrls].slice(0, MAX_IMAGES));
  }

  async function submit() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/portal/${token}/evidence`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ images, description }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error("failed");
      setImages([]);
      setDescription("");
      setMessage(
        `Thanks — ${body.data.submitted} item(s) sent to your assessor for review.`,
      );
    } catch {
      setMessage("Couldn’t send that. Please check your connection and retry.");
    } finally {
      setBusy(false);
    }
  }

  const canSend = !busy && (images.length > 0 || description.trim().length > 0);

  return (
    <section className={`${clientPortalPanelPadding} space-y-3`}>
      <div>
        <h2 className="text-sm font-semibold text-white/95">
          Add photos or a note
        </h2>
        <p className="text-xs text-slate-400">
          Upload photos of the damage and add a short description. Your assessor
          reviews everything you send before it is added to the official report.
        </p>
      </div>

      <label
        htmlFor="ev-files"
        className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-4 text-sm font-medium text-cyan-100 hover:bg-cyan-500/20"
      >
        Add photos
      </label>
      <input
        id="ev-files"
        type="file"
        accept="image/*"
        multiple
        onChange={onFiles}
        aria-label="Add photos"
        className="sr-only"
      />
      {images.length > 0 && (
        <p className="text-xs text-slate-400">{images.length} photo(s) ready</p>
      )}

      <textarea
        aria-label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Describe the damage (optional)…"
        rows={3}
        maxLength={2000}
        className="w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
      />

      <button
        type="button"
        onClick={submit}
        disabled={!canSend}
        aria-label="Send to my assessor"
        className={`${clientPortalPrimaryLink} disabled:opacity-40`}
      >
        {busy ? "Sending…" : "Send to my assessor"}
      </button>

      {message && (
        <p role="status" className="text-xs text-slate-300">
          {message}
        </p>
      )}
    </section>
  );
}
