/**
 * RA-8613 - runs work after the HTTP response has been sent.
 *
 * The public recovery request must take the same time and give the same answer
 * whether or not the address has an account or an invitation. Sending mail
 * takes a network round trip that only a matching address pays for, so mail is
 * never awaited on that path: it is handed to this helper, which owns the one
 * rule "the caller does not wait and never sees a failure".
 *
 * Inside a Next request, `after()` keeps the serverless function alive until
 * the work finishes. Outside a request (unit tests, scripts) `after()` throws,
 * and the work runs immediately without being awaited.
 */
import { after } from "next/server";

export function afterResponse(work: () => Promise<unknown>): void {
  const run = async () => {
    try {
      await work();
    } catch {
      // No account, address or error text: this runs for matched addresses only.
      console.error("[portal] deferred recovery work failed");
    }
  };
  try {
    after(run);
  } catch {
    void run();
  }
}
