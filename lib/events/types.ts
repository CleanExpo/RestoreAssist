/**
 * Typed domain event catalogue for RestoreAssist.
 *
 * Rules:
 *   - Every event has a `type` discriminant and a `payload`.
 *   - Payloads carry only stable identifiers — subscribers fetch full
 *     entities from DB rather than trusting snapshot values.
 *   - Add new events here; never delete or rename existing ones (consumers
 *     may still be subscribed).
 *
 * P1-ARCH2 — RA-1127
 */

// ─── Inspection ───────────────────────────────────────────────────────────────

export interface InspectionSubmittedEvent {
  type: "inspection.submitted";
  payload: {
    inspectionId: string;
    userId: string;
    propertyPostcode: string;
    timestamp: string; // ISO-8601
  };
}

export interface InspectionClassifiedEvent {
  type: "inspection.classified";
  payload: {
    inspectionId: string;
    category: string;
    class: string;
    isFinal: boolean;
    timestamp: string;
  };
}

// ─── Claim ────────────────────────────────────────────────────────────────────

export interface ClaimHandedOverEvent {
  type: "claim.handed_over";
  payload: {
    inspectionId: string;
    userId: string;
    insurerEmail: string | null;
    handoverAt: string;
  };
}

export interface ClaimVariationCreatedEvent {
  type: "claim.variation_created";
  payload: {
    inspectionId: string;
    variationId: string;
    costDeltaCents: number;
    status: string; // "PENDING" | "AUTO_APPROVED"
    timestamp: string;
  };
}

// ─── Make-Safe ────────────────────────────────────────────────────────────────

export interface MakeSafeAuthorisedEvent {
  type: "make_safe.authorised";
  payload: {
    inspectionId: string;
    authorisedBy: string;
    timestamp: string;
  };
}

export interface MakeSafeActionCompletedEvent {
  type: "make_safe.action_completed";
  payload: {
    inspectionId: string;
    action: string;
    completedByUserId: string;
    timestamp: string;
  };
}

// ─── Moisture / Drying ────────────────────────────────────────────────────────

export interface MoistureReadingAddedEvent {
  type: "moisture.reading_added";
  payload: {
    inspectionId: string;
    readingId: string;
    userId: string;
    timestamp: string;
  };
}

// ─── Payment / Invoice ────────────────────────────────────────────────────────

export interface PaymentReceivedEvent {
  type: "payment.received";
  payload: {
    invoiceId: string;
    userId: string;
    amountCents: number;
    timestamp: string;
  };
}

// ─── Report ───────────────────────────────────────────────────────────────────

export interface ReportGeneratedEvent {
  type: "report.generated";
  payload: {
    reportId: string;
    userId: string;
    timestamp: string;
  };
}

// ─── Union ────────────────────────────────────────────────────────────────────

export type DomainEvent =
  | InspectionSubmittedEvent
  | InspectionClassifiedEvent
  | ClaimHandedOverEvent
  | ClaimVariationCreatedEvent
  | MakeSafeAuthorisedEvent
  | MakeSafeActionCompletedEvent
  | MoistureReadingAddedEvent
  | PaymentReceivedEvent
  | ReportGeneratedEvent;

export type DomainEventType = DomainEvent["type"];

export type EventPayload<T extends DomainEventType> = Extract<
  DomainEvent,
  { type: T }
>["payload"];
