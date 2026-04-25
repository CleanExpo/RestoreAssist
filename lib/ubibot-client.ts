/**
 * Ubibot REST API client — RA-1613
 *
 * Covers the public Ubibot cloud API used by WS1/SP1/GS1 sensors.
 * Auth: account_key query parameter (no OAuth).
 *
 * Rate limit: Ubibot free tier ≈ 1 req/s.
 * Add a 350ms delay between channel requests when draining the queue.
 *
 * API docs: https://www.ubibot.com/pages/api
 */

const BASE_URL = "https://api.ubibot.com";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface UbibotChannel {
  channel_id: string;
  name: string;
  field1?: string; // temperature label
  field2?: string; // humidity label
  last_entry_id?: number;
}

export interface UbibotLastValues {
  /** Celsius — null if sensor did not report or value unparseable */
  temperature: number | null;
  /** 0–100% — null if sensor did not report */
  humidity: number | null;
  recordedAt: Date;
}

// ─── API CLIENT ───────────────────────────────────────────────────────────────

/**
 * List all channels for a Ubibot account.
 * Throws on HTTP error or network failure.
 */
export async function listUbibotChannels(
  accountKey: string,
): Promise<UbibotChannel[]> {
  const url = `${BASE_URL}/channels?account_key=${encodeURIComponent(accountKey)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Ubibot API error ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { channels?: UbibotChannel[] };
  return data.channels ?? [];
}

/**
 * Fetch the last recorded values for a single channel.
 * Returns null temperature/humidity if the feed is empty or unparseable.
 */
export async function getLastValues(
  accountKey: string,
  channelId: string,
): Promise<UbibotLastValues> {
  const url = `${BASE_URL}/channels/${encodeURIComponent(channelId)}/last_values.json?account_key=${encodeURIComponent(accountKey)}`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(
      `Ubibot API error ${res.status} for channel ${channelId}: ${await res.text()}`,
    );
  }

  const data = (await res.json()) as {
    feeds?: Array<{ field1?: string; field2?: string; created_at?: string }>;
    channel?: { field1?: string; field2?: string };
  };

  const feed = data.feeds?.[0];
  const temperature = parseFloat(feed?.field1 ?? "");
  const humidity = parseFloat(feed?.field2 ?? "");
  const recordedAt = feed?.created_at
    ? new Date(feed.created_at)
    : new Date();

  return {
    temperature: Number.isFinite(temperature) ? temperature : null,
    humidity: Number.isFinite(humidity) ? humidity : null,
    recordedAt,
  };
}

/** Convenience: 350ms delay between Ubibot requests to respect free-tier rate limit */
export function ubibotDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 350));
}
