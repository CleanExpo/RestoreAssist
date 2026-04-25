"use client";

/**
 * Ubibot Integration Page — RA-1613
 *
 * 1. Connect with account_key
 * 2. Browse live channels
 * 3. Assign each channel to an inspection + optional room label
 */

import { useCallback, useEffect, useState } from "react";
import { Wifi, Loader2, Link2Off, Link2, Thermometer, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Channel {
  channelId: string;
  channelName: string;
  inspectionId: string | null;
  roomName: string | null;
}

type PageState = "loading" | "disconnected" | "connected";

export default function UbibotIntegrationPage() {
  const [pageState, setPageState] = useState<PageState>("loading");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [accountKey, setAccountKey] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Load state on mount ────────────────────────────────────
  const loadChannels = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/integrations/ubibot/channels");
      if (res.status === 404) {
        setPageState("disconnected");
        return;
      }
      if (!res.ok) throw new Error("Failed to load channels");
      const data = (await res.json()) as { channels: Channel[] };
      setChannels(data.channels);
      setPageState("connected");
    } catch (err) {
      console.error("[UbibotPage]", err);
      setError("Could not load Ubibot status. Check your connection.");
      setPageState("disconnected");
    }
  }, []);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  // ── Connect ───────────────────────────────────────────────
  async function handleConnect() {
    if (!accountKey.trim()) return;
    setConnecting(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/ubibot/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountKey: accountKey.trim() }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Connection failed");
      setAccountKey("");
      await loadChannels();
    } catch (err) {
      console.error("[UbibotPage/connect]", err);
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setConnecting(false);
    }
  }

  // ── Disconnect ────────────────────────────────────────────
  async function handleDisconnect() {
    setError(null);
    try {
      const res = await fetch("/api/integrations/ubibot/connect", {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Disconnect failed");
      setChannels([]);
      setPageState("disconnected");
    } catch (err) {
      console.error("[UbibotPage/disconnect]", err);
      setError("Disconnect failed. Try again.");
    }
  }

  // ── Assign channel ────────────────────────────────────────
  async function handleAssign(
    channel: Channel,
    inspectionId: string,
    roomName: string,
  ) {
    setError(null);
    try {
      const res = await fetch("/api/integrations/ubibot/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: channel.channelId,
          channelName: channel.channelName,
          inspectionId,
          roomName: roomName || undefined,
        }),
      });
      if (!res.ok) throw new Error("Assignment failed");
      setChannels((prev) =>
        prev.map((c) =>
          c.channelId === channel.channelId
            ? { ...c, inspectionId, roomName }
            : c,
        ),
      );
    } catch (err) {
      console.error("[UbibotPage/assign]", err);
      setError("Failed to save assignment.");
    }
  }

  // ── Remove assignment ─────────────────────────────────────
  async function handleRemoveAssignment(channelId: string) {
    setError(null);
    try {
      const res = await fetch("/api/integrations/ubibot/assign", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId }),
      });
      if (!res.ok) throw new Error("Failed to remove assignment");
      setChannels((prev) =>
        prev.map((c) =>
          c.channelId === channelId
            ? { ...c, inspectionId: null, roomName: null }
            : c,
        ),
      );
    } catch (err) {
      console.error("[UbibotPage/remove-assignment]", err);
      setError("Failed to remove assignment.");
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
          <Wifi size={20} className="text-blue-400" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white">Ubibot Integration</h1>
          <p className="text-sm text-white/40">
            WiFi thermo-hygrometers (WS1 / SP1 / GS1) — auto-polling every 60s
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {pageState === "loading" && (
        <div className="flex items-center gap-2 text-white/30 py-8 justify-center">
          <Loader2 size={16} className="animate-spin" />
          Loading…
        </div>
      )}

      {/* Disconnected — connect form */}
      {pageState === "disconnected" && (
        <div className="rounded-xl border border-white/10 bg-[#0d1b2e] p-6 space-y-4">
          <h2 className="text-sm font-semibold text-white/70">Connect your Ubibot account</h2>
          <p className="text-xs text-white/40 leading-relaxed">
            Find your account key in the Ubibot web app under{" "}
            <span className="font-medium text-white/60">Account → API Token</span>.
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={accountKey}
              onChange={(e) => setAccountKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConnect()}
              placeholder="Paste your account_key"
              className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <button
              type="button"
              onClick={handleConnect}
              disabled={connecting || !accountKey.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-400 disabled:opacity-40 transition-colors"
            >
              {connecting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Link2 size={14} />
              )}
              Connect
            </button>
          </div>
        </div>
      )}

      {/* Connected — channel list */}
      {pageState === "connected" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-white/50">
              {channels.length} channel{channels.length !== 1 ? "s" : ""} found
            </p>
            <button
              type="button"
              onClick={handleDisconnect}
              className="flex items-center gap-1.5 text-xs text-white/30 hover:text-rose-400 transition-colors"
            >
              <Link2Off size={12} />
              Disconnect
            </button>
          </div>

          {channels.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-[#0d1b2e] py-10 text-center text-sm text-white/30">
              No channels found on this account.
            </div>
          ) : (
            channels.map((channel) => (
              <ChannelRow
                key={channel.channelId}
                channel={channel}
                onAssign={handleAssign}
                onRemove={handleRemoveAssignment}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Channel row ────────────────────────────────────────────────────────────────

interface ChannelRowProps {
  channel: Channel;
  onAssign: (channel: Channel, inspectionId: string, roomName: string) => Promise<void>;
  onRemove: (channelId: string) => Promise<void>;
}

function ChannelRow({ channel, onAssign, onRemove }: ChannelRowProps) {
  const [editing, setEditing] = useState(false);
  const [inspectionId, setInspectionId] = useState(channel.inspectionId ?? "");
  const [roomName, setRoomName] = useState(channel.roomName ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!inspectionId.trim()) return;
    setSaving(true);
    await onAssign(channel, inspectionId.trim(), roomName.trim());
    setSaving(false);
    setEditing(false);
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#0d1b2e] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Thermometer size={14} className="text-blue-400 flex-shrink-0" />
        <span className="text-sm font-medium text-white">{channel.channelName}</span>
        <span className="text-xs text-white/30 ml-auto font-mono">{channel.channelId}</span>
      </div>

      {!editing && channel.inspectionId && (
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-white/50 space-y-0.5">
            <p>
              Inspection:{" "}
              <span className="font-mono text-white/70">{channel.inspectionId}</span>
            </p>
            {channel.roomName && (
              <p>
                Room: <span className="text-white/70">{channel.roomName}</span>
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs text-white/40 hover:text-white transition-colors px-2 py-1 rounded-md hover:bg-white/5"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onRemove(channel.channelId)}
              className="text-xs text-rose-400/70 hover:text-rose-400 transition-colors px-2 py-1 rounded-md hover:bg-rose-500/10"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {!editing && !channel.inspectionId && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={cn(
            "w-full text-xs text-white/30 border border-dashed border-white/10",
            "hover:border-blue-400/40 hover:text-blue-400/70 rounded-lg py-2 transition-colors",
          )}
        >
          + Assign to inspection
        </button>
      )}

      {editing && (
        <div className="space-y-2">
          <input
            type="text"
            value={inspectionId}
            onChange={(e) => setInspectionId(e.target.value)}
            placeholder="Inspection ID"
            className="w-full px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs font-mono placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <input
            type="text"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            placeholder="Room / area label (optional)"
            className="w-full px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !inspectionId.trim()}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-medium hover:bg-blue-400 disabled:opacity-40 transition-colors"
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setInspectionId(channel.inspectionId ?? "");
                setRoomName(channel.roomName ?? "");
              }}
              className="px-3 py-1.5 rounded-lg text-white/40 hover:text-white text-xs transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
