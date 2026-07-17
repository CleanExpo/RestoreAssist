#!/usr/bin/env node
/**
 * P0-1 acceptance e2e — private evidence/sketch buckets (spec Appendix C, PR #1969).
 *
 * Acceptance criterion (handoff §6 / RA-7075): an anonymous request to a raw
 * object URL in the privatised buckets must be refused, while an authorised
 * signed URL still loads the bytes. This is the read-path proof that
 * privatising evidence-optimised + sketch-media did not regress evidence
 * display — #1969 must not merge until this passes against a live env.
 *
 * ENV-GATED: needs a live Supabase project. Without env it exits 2 with an
 * explicit message — an unrun gate is reported as unrun, never as green.
 *
 *   SUPABASE_URL                (or NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY   (service role — mints objects + signed URLs)
 *
 * Run: pnpm e2e:p0-1
 * Exit: 0 all assertions pass · 1 any assertion fails · 2 env missing/setup error
 */
import { createClient } from "@supabase/supabase-js";

const BUCKETS = ["evidence-optimised", "sketch-media"];
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "p0-1 acceptance: ENV-GATED SKIP — SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (live project). Not run, NOT green.",
  );
  process.exit(2);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const failures = [];
const passes = [];

function assert(cond, label) {
  if (cond) {
    passes.push(label);
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.error(`  FAIL  ${label}`);
  }
}

const stamp = `p0-1-e2e/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`;
const body = `p0-1 acceptance probe ${stamp}`;

for (const bucket of BUCKETS) {
  console.log(`bucket: ${bucket}`);

  // Bucket metadata must say private.
  const { data: buckets, error: listErr } = await admin.storage.listBuckets();
  if (listErr) {
    console.error(`  setup error listing buckets: ${listErr.message}`);
    process.exit(2);
  }
  const meta = buckets.find((b) => b.name === bucket);
  assert(meta && meta.public === false, `${bucket}: bucket metadata is private`);

  // Positive control — the probe object must exist before we test denial,
  // otherwise a 404 from a missing object masquerades as a 403 from privacy.
  const up = await admin.storage.from(bucket).upload(stamp, body, {
    contentType: "text/plain",
    upsert: true,
  });
  if (up.error) {
    console.error(`  setup error uploading probe: ${up.error.message}`);
    process.exit(2);
  }

  // Service-role download proves the object is really there (positive control).
  const dl = await admin.storage.from(bucket).download(stamp);
  assert(
    !dl.error && (await dl.data.text()) === body,
    `${bucket}: positive control — service role reads the probe object`,
  );

  // 1. Anonymous raw public-object URL must be refused (400/403/404 — not 200).
  const publicUrl = `${url}/storage/v1/object/public/${bucket}/${stamp}`;
  const anon = await fetch(publicUrl);
  assert(
    anon.status !== 200,
    `${bucket}: anon public-object URL refused (got ${anon.status})`,
  );

  // 2. Signed URL loads the bytes.
  const signed = await admin.storage.from(bucket).createSignedUrl(stamp, 60);
  if (signed.error) {
    assert(false, `${bucket}: createSignedUrl succeeds (${signed.error.message})`);
  } else {
    const ok = await fetch(signed.data.signedUrl);
    const text = ok.status === 200 ? await ok.text() : "";
    assert(
      ok.status === 200 && text === body,
      `${bucket}: signed URL returns the probe bytes (got ${ok.status})`,
    );
  }

  // 3. Expired signed URL is refused.
  const short = await admin.storage.from(bucket).createSignedUrl(stamp, 1);
  if (!short.error) {
    await new Promise((r) => setTimeout(r, 2500));
    const expired = await fetch(short.data.signedUrl);
    assert(
      expired.status !== 200,
      `${bucket}: expired signed URL refused (got ${expired.status})`,
    );
  } else {
    assert(false, `${bucket}: createSignedUrl(1s) succeeds (${short.error.message})`);
  }

  // Cleanup.
  await admin.storage.from(bucket).remove([stamp]);
}

console.log(`\np0-1 acceptance: ${passes.length} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
