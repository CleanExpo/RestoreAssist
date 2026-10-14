/**
 * DISABLED 14/10/2026 by the owner: UNPROVEN, NOT A PASS.
 * Its canary list (scripts/standards-fingerprints.ts) held licensed standards
 * text and was removed. Replacement: the iicrc-fp content matcher
 * (fix/iicrc-content-fingerprint). Until then this checks nothing.
 */
console.log(
  "::warning title=Verbatim standards tripwire::UNPROVEN - disabled until the iicrc-fp matcher lands; this step checked nothing.",
);
console.log("UNPROVEN: verbatim standards tripwire disabled (no canary list). This is not a pass.");
process.exit(0);
export {};
