/**
 * RA-8494 shared test double for `lib/auth/redact-money.ts`: the caller is an
 * owner or manager who may see money.
 *
 * Use it ONLY in a suite whose caller is an owner, a manager or a solo
 * account, and whose subject is something other than the money rule (pricing,
 * GST, invoice lifecycle, PDF layout). Enable it with one line:
 *
 *   vi.mock("@/lib/auth/redact-money");
 *
 * A suite that asserts what a technician receives must NOT use this file: it
 * runs the real rule with real user rows. The rule itself is proven in
 * `app/api/inspections/__tests__/technician-no-money.test.ts`, which never
 * mocks this module.
 */
import { vi } from "vitest";
import type { SessionLike, TenancyResult } from "@/lib/auth/assert-tenancy";

export {
  MONEY_KEYS,
  MONEY_RELATIONS,
  MONEY_JSON_TEXT_KEYS,
  MONEY_JSON_OR_PROSE_KEYS,
  redactMoney,
  withoutMoneyWrites,
  keepHiddenMoney,
} from "../money-redaction";

type Session = SessionLike | null | undefined;

export const canSeeMoney = vi.fn(
  async (session: Session): Promise<boolean> => Boolean(session?.user?.id),
);

export const assertMoneyViewer = vi.fn(
  async (session: Session): Promise<TenancyResult<true>> =>
    session?.user?.id
      ? { ok: true, data: true }
      : { ok: false, status: 401, reason: "Unauthorized" },
);

export const moneySafe = vi.fn(
  async <T>(_session: Session, value: T): Promise<T> => value,
);
