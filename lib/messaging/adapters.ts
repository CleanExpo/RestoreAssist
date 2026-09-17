import type { ChannelAdapter } from "./types";
import { telegramAdapter } from "./telegram-adapter";

const ADAPTERS: Record<string, ChannelAdapter> = {
  telegram: telegramAdapter,
};

/** The adapter for a channel path segment, or null for an unknown channel. */
export function getChannelAdapter(channel: string): ChannelAdapter | null {
  return Object.prototype.hasOwnProperty.call(ADAPTERS, channel)
    ? ADAPTERS[channel]
    : null;
}
