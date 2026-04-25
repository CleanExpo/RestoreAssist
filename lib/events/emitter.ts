/**
 * In-process typed event bus for RestoreAssist.
 *
 * Wraps Node's EventEmitter with type-safe emit/subscribe APIs derived
 * from the DomainEvent catalogue in ./types.
 *
 * Usage:
 *   import { domainEvents } from "@/lib/events/emitter";
 *
 *   // Emit (fire-and-forget — never throws):
 *   domainEvents.emit({
 *     type: "claim.handed_over",
 *     payload: { inspectionId, userId, insurerEmail, handoverAt }
 *   });
 *
 *   // Subscribe (call once at startup or in a server component init):
 *   domainEvents.on("claim.handed_over", (payload) => { ... });
 *
 * Limitations:
 *   - In-process only: events don't survive serverless function restarts.
 *   - For cross-process delivery, back with a queue (SQS, Redis Streams).
 *   - Subscriber errors are caught and logged; they never affect the emitter.
 *
 * P1-ARCH2 — RA-1127
 */

import { EventEmitter } from "events";
import type { DomainEvent, DomainEventType, EventPayload } from "./types";

class TypedEventEmitter {
  private readonly ee = new EventEmitter();

  constructor() {
    // Prevent unhandled-listener warnings during dev — we want silent no-ops
    // when no subscriber is registered for a given event type.
    this.ee.setMaxListeners(50);
  }

  emit<T extends DomainEventType>(
    event: Extract<DomainEvent, { type: T }>,
  ): void {
    try {
      this.ee.emit(event.type, event.payload);
    } catch (err) {
      console.error("[events] emit error:", err);
    }
  }

  on<T extends DomainEventType>(
    type: T,
    handler: (payload: EventPayload<T>) => void | Promise<void>,
  ): () => void {
    const wrapper = (payload: EventPayload<T>) => {
      try {
        const result = handler(payload);
        if (result instanceof Promise) {
          result.catch((err) =>
            console.error(`[events] subscriber error (${type}):`, err),
          );
        }
      } catch (err) {
        console.error(`[events] subscriber error (${type}):`, err);
      }
    };
    this.ee.on(type, wrapper as (...args: unknown[]) => void);
    return () => this.ee.off(type, wrapper as (...args: unknown[]) => void);
  }

  once<T extends DomainEventType>(
    type: T,
    handler: (payload: EventPayload<T>) => void | Promise<void>,
  ): void {
    const wrapper = (payload: EventPayload<T>) => {
      try {
        const result = handler(payload);
        if (result instanceof Promise) {
          result.catch((err) =>
            console.error(`[events] once-subscriber error (${type}):`, err),
          );
        }
      } catch (err) {
        console.error(`[events] once-subscriber error (${type}):`, err);
      }
    };
    this.ee.once(type, wrapper as (...args: unknown[]) => void);
  }
}

export const domainEvents = new TypedEventEmitter();
