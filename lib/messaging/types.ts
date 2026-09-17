/**
 * Text the Job In (S1) — channel adapter contract.
 *
 * Each chat channel (Telegram in S1; SMS/WhatsApp in S3) implements this so the
 * webhook route never touches a provider's payload shape or credentials.
 */

export interface InboundMessage {
  /** "<channel>:<provider message id>" — unique per delivery, used for idempotency. */
  externalId: string;
  /** The provider's stable sender id. Matched against MessagingIdentity.address. */
  address: string;
  /** Where a reply goes (Telegram: chat.id). */
  replyTo: string;
  text: string;
  /** Provider media references. Always empty in S1 (text only). */
  mediaRefs: string[];
}

export interface ChannelAdapter {
  readonly channel: string;
  /** True only when the request provably came from the provider. Fails closed. */
  verify(request: Request, rawBody: string): boolean;
  /** Null when the update is not a text message this slice handles. */
  parse(rawBody: string): InboundMessage | null;
  /** Send a text reply. Throws on failure; callers decide whether that matters. */
  reply(replyTo: string, text: string): Promise<void>;
  /** Download a media reference. Not available until S2. */
  fetchMedia(ref: string): Promise<Uint8Array>;
}
