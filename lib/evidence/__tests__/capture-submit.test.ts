/**
 * RA-7090 slice 2 P1 (capture path): the capture-submit orchestration is
 * extracted from app/dashboard/inspections/[id]/capture/page.tsx so its
 * fail-closed behaviour is unit-testable. The page wires the real signing,
 * fetch and key-rotation effects into `submitSignedCapture`, so these tests
 * exercise the exact orchestration the technician's device runs.
 *
 * The defect this locks down: a signing/registration failure USED to fall
 * through to an UNSIGNED submission, and a 403 on a signed POST USED to
 * rotate the key then resubmit UNSIGNED with the same success toast. Both are
 * silent chain-of-custody downgrades on a legal-facing product.
 */
import { describe, it, expect, vi } from "vitest";
import { submitSignedCapture } from "../capture-submit";

describe("submitSignedCapture — never silently downgrades to unsigned", () => {
  // POSITIVE CONTROL #2a: a signing failure SURFACES; it never produces an
  // unsigned submission.
  it("PROPAGATES a signing failure instead of posting unsigned", async () => {
    const signAndPost = vi.fn(async () => {
      throw new Error("signing unavailable");
    });
    const rotateKey = vi.fn(async () => undefined);

    await expect(
      submitSignedCapture({ signAndPost, rotateKey }),
    ).rejects.toThrow(/signing unavailable/);

    // The only submit seam is signAndPost, which SIGNS. There is no unsigned
    // fallback path to call at all.
    expect(rotateKey).not.toHaveBeenCalled();
    expect(signAndPost).toHaveBeenCalledTimes(1);
    expect(signAndPost).toHaveBeenCalledWith("initial");
  });

  // POSITIVE CONTROL #2b: a 403 rotates the key and RE-SIGNS — it does not
  // resubmit unsigned. This models the real page seam: signAndPost SIGNS
  // (produces a manifest+signature) and posts that body. We assert the body
  // POSTed on the retry actually CARRIES a signed manifest, not merely that a
  // second call happened.
  it("on 403 rotates the key and RE-SIGNS with a fresh signed manifest", async () => {
    const rotateKey = vi.fn(async () => undefined);
    // Each attempt signs afresh; a fresh key id proves the retry re-signed.
    const sign = vi
      .fn()
      .mockResolvedValueOnce({
        manifestJson: '{"deviceKeyId":"key-1"}',
        signature: "sig-1",
      })
      .mockResolvedValueOnce({
        manifestJson: '{"deviceKeyId":"key-2"}',
        signature: "sig-2",
      });
    const postedBodies: Array<{
      manifestJson: string;
      signature: string;
    } | null> = [];
    const signAndPost = vi.fn(async (attempt: "initial" | "resigned") => {
      // The ONLY way to build a body here is to sign — there is no unsigned
      // branch, mirroring the page's signAndPost closure.
      const signed = await sign();
      postedBodies.push(signed);
      return attempt === "initial"
        ? { status: 403, ok: false }
        : { status: 201, ok: true };
    });

    const res = await submitSignedCapture({ signAndPost, rotateKey });

    expect(res).toEqual({ status: 201, ok: true });
    expect(rotateKey).toHaveBeenCalledTimes(1);
    expect(sign).toHaveBeenCalledTimes(2);
    expect(postedBodies).toHaveLength(2);
    // The RETRY body carries a signed manifest + signature (never unsigned),
    // and it is a DIFFERENT (freshly rotated) key than the first attempt.
    expect(postedBodies[1]).not.toBeNull();
    expect(postedBodies[1]!.signature).toBe("sig-2");
    expect(postedBodies[1]!.manifestJson).toContain("key-2");
    expect(postedBodies[1]!.manifestJson).not.toBe(postedBodies[0]!.manifestJson);
  });

  // A non-403 failure is surfaced verbatim, never masked as success.
  it("surfaces a non-403 failure without rotating or re-signing", async () => {
    const signAndPost = vi.fn(async () => ({ status: 400, ok: false }));
    const rotateKey = vi.fn(async () => undefined);

    const res = await submitSignedCapture({ signAndPost, rotateKey });

    expect(res).toEqual({ status: 400, ok: false });
    expect(rotateKey).not.toHaveBeenCalled();
    expect(signAndPost).toHaveBeenCalledTimes(1);
  });

  // A rotation that itself fails must surface, not fall back to unsigned.
  it("PROPAGATES a rotation failure after a 403", async () => {
    const signAndPost = vi.fn(async () => ({ status: 403, ok: false }));
    const rotateKey = vi.fn(async () => {
      throw new Error("key rotation failed");
    });

    await expect(
      submitSignedCapture({ signAndPost, rotateKey }),
    ).rejects.toThrow(/key rotation failed/);
    // Only the initial signed attempt ran; no unsigned re-post.
    expect(signAndPost).toHaveBeenCalledTimes(1);
  });

  // A still-403 after re-signing is surfaced (caller throws on !ok) — the
  // record is never persisted unsigned to force a success.
  it("returns the re-signed result even if it is still not ok", async () => {
    const signAndPost = vi.fn(async () => ({ status: 403, ok: false }));
    const rotateKey = vi.fn(async () => undefined);

    const res = await submitSignedCapture({ signAndPost, rotateKey });

    expect(res).toEqual({ status: 403, ok: false });
    expect(signAndPost).toHaveBeenCalledTimes(2);
    expect(rotateKey).toHaveBeenCalledTimes(1);
  });
});
