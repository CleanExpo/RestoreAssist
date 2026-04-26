/**
 * Domain plug-in registry — RA-1717.
 *
 * Adding a new domain (mould / biohazard / fire-smoke / hvac / storm /
 * australian-compliance / etc.) is one line: import the plug-in and add
 * it here. The orchestrator reads from this map; nothing else hard-codes
 * domain knowledge.
 *
 * Domain order in `DOMAIN_REGISTRY` is the order they appear in UI
 * domain pickers when none is specified.
 */

import type { AssessmentDomain, DomainPlugin } from "./types";
import { waterDomain } from "./domains/water";

const DOMAIN_LIST: DomainPlugin[] = [
  waterDomain,
  // Future: mouldDomain, biohazardDomain, fireSmokeDomain, hvacDomain,
  // stormDomain, australianComplianceDomain — each follows the same
  // contract from lib/assessments/types.ts::DomainPlugin.
];

const DOMAIN_REGISTRY = new Map<AssessmentDomain, DomainPlugin>(
  DOMAIN_LIST.map((p) => [p.domain, p]),
);

/** Returns a plug-in for the given domain, or null if not registered. */
export function getDomainPlugin(
  domain: AssessmentDomain,
): DomainPlugin | null {
  return DOMAIN_REGISTRY.get(domain) ?? null;
}

/** All registered domains, in canonical UI order. */
export function listDomains(): readonly DomainPlugin[] {
  return DOMAIN_LIST;
}

/** All registered domain keys. */
export function listDomainKeys(): AssessmentDomain[] {
  return DOMAIN_LIST.map((p) => p.domain);
}

/** True iff the given string is a registered domain. */
export function isRegisteredDomain(s: string): s is AssessmentDomain {
  return DOMAIN_REGISTRY.has(s as AssessmentDomain);
}
