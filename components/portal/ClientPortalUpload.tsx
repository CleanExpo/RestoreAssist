"use client";

/**
 * Client-portal evidence upload (client portal Phase 2b).
 *
 * Lets the client add photos + a short description from their portal link and
 * send them to their assessor. Posts to the token-gated, quarantined route
 * (POST /api/portal/[token]/evidence) built in Phase 2 — submissions are held
 * for staff review, never auto-added to the report.
 */

import { useState } from "react";

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
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">
          Add photos or a note
        </h2>
        <p className="text-xs text-slate-500">
          Upload photos of the damage and add a short description. Your assessor
          reviews everything you send.
        </p>
      </div>

      <label
        htmlFor="ev-files"
        className="inline-flex items-center min-h-11 px-4 rounded-lg border border-cyan-300 bg-cyan-50 text-cyan-700 text-sm font-medium cursor-pointer hover:bg-cyan-100"
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
        <p className="text-xs text-slate-600">{images.length} photo(s) ready</p>
      )}

      <textarea
        aria-label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Describe the damage (optional)…"
        rows={3}
        maxLength={2000}
        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-400"
      />

      <button
        type="button"
        onClick={submit}
        disabled={!canSend}
        aria-label="Send to my assessor"
        className="min-h-11 px-4 rounded-lg bg-cyan-600 text-white text-sm font-medium hover:bg-cyan-700 transition-colors disabled:opacity-40"
      >
        {busy ? "Sending…" : "Send to my assessor"}
      </button>

      {message && (
        <p role="status" className="text-xs text-slate-700">
          {message}
        </p>
      )}
    </section>
  );
}
