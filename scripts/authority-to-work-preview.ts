/**
 * No-send preview of the Authority to Work planner on three FICTIONAL jobs
 * (RA-8468). Prints what the CRM would show: per-line gates, and the draft
 * forms with recipient, prefilled fields and why each cannot be sent yet.
 *
 * Run: npx tsx scripts/authority-to-work-preview.ts
 * Nothing is sent, saved or charged.
 */
import { FIXTURES } from "../lib/authority-to-work/fixtures";
import { planAuthority } from "../lib/authority-to-work/plan";

let failures = 0;
for (const [name, make] of Object.entries(FIXTURES)) {
  const job = make();
  const plan = planAuthority(job);
  const who = (id: string | null): string =>
    job.parties.find((p) => p.id === id)?.name ?? "(recipient not identified)";

  console.log(`\n=== ${name} (${plan.jurisdiction}) [FICTIONAL] ===`);
  for (const h of plan.holds) console.log(`HOLD: ${h}`);
  for (const s of plan.scopes) {
    console.log(`\n  ${s.scopeLineId} ${s.description} -- ${s.assetLabel} -- ${s.canStart ? "CAN START" : "CANNOT START"}`);
    for (const g of s.gates) {
      if (g.state !== "NOT_APPLICABLE") console.log(`    ${g.gate.padEnd(8)} ${g.state.padEnd(8)} ${g.reason}`);
    }
  }
  console.log(`\n  Draft forms (${plan.forms.length}), none sendable:`);
  for (const f of plan.forms) {
    console.log(`   - ${f.code} ${f.name} -> ${who(f.recipientPartyId)} [lines ${f.scopeLineIds.join(", ")}]`);
    console.log(`       why: ${f.reason}`);
    console.log(`       customer sees: ${f.customerPreview}`);
    const blanks = f.fields.filter((x) => x.value === null).map((x) => x.key);
    if (blanks.length) console.log(`       blank: ${blanks.join(", ")}`);
  }
  console.log(`  Deposit: requested=${plan.deposit.requested} enabled=${plan.deposit.enabled}`);

  if (plan.sendable !== false || plan.forms.some((f) => f.sendable !== false)) failures++;
}

if (failures > 0) {
  console.error(`\n${failures} plan(s) marked something sendable`);
  process.exit(1);
}
