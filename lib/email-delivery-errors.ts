/**
 * A deterministic failure proven to have happened before provider I/O.
 * These failures are safe to retry after configuration/input is repaired.
 */
export class EmailDeliveryNotAttempted extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailDeliveryNotAttempted";
  }
}

/**
 * The provider returned a definitive rejection response. No message was
 * accepted, so retrying after the input/configuration is repaired is safe.
 */
export class EmailDeliveryRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailDeliveryRejected";
  }
}
