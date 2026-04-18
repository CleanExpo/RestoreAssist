/**
 * Guard registry. Maps every TransitionKey to its evidence-contract guard.
 *
 * Board reference: .claude/board-2026-04-18/00-board-minutes.md §5.2.
 * Every entry here IS the auditable enforcement of the Stage × Required
 * Evidence matrix that the board approved in Motion M-2.
 */

import type { TransitionKey } from "../state-machine";
import type { GuardFn } from "./types";
import {
  attestStabilisationGuard,
  whsIncidentRaisedGuard,
  whsClearedGuard,
} from "./stabilisation";
import {
  approveScopeGuard,
  raiseVariationGuard,
  variationApprovedGuard,
  variationRejectedGuard,
} from "./scope";
import { commenceDryingGuard, certifyDryingGuard } from "./drying";
import {
  initiateCloseoutGuard,
  issueInvoiceGuard,
  recordPaymentGuard,
} from "./invoice";
import {
  raiseDisputeGuard,
  disputeResolvedGuard,
  writeOffGuard,
  closeClaimGuard,
  withdrawGuard,
} from "./dispute";
import {
  startStabilisationGuard,
  beginScopeGuard,
  reopenDryingGuard,
} from "./start";

export const GUARDS: Record<TransitionKey, GuardFn> = {
  start_stabilisation: startStabilisationGuard,
  attest_stabilisation: attestStabilisationGuard,
  whs_incident_raised: whsIncidentRaisedGuard,
  whs_cleared: whsClearedGuard,
  begin_scope: beginScopeGuard,
  approve_scope: approveScopeGuard,
  commence_drying: commenceDryingGuard,
  raise_variation: raiseVariationGuard,
  variation_approved: variationApprovedGuard,
  variation_rejected: variationRejectedGuard,
  certify_drying: certifyDryingGuard,
  initiate_closeout: initiateCloseoutGuard,
  issue_invoice: issueInvoiceGuard,
  reopen_drying: reopenDryingGuard,
  record_payment: recordPaymentGuard,
  raise_dispute: raiseDisputeGuard,
  dispute_resolved: disputeResolvedGuard,
  write_off: writeOffGuard,
  close_claim: closeClaimGuard,
  withdraw: withdrawGuard,
};

export function guardFor(key: TransitionKey): GuardFn {
  return GUARDS[key];
}

export type { GuardFn, GuardContext, GuardResult } from "./types";
