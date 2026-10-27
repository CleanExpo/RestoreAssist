import { beforeEach, describe, expect, it, vi } from "vitest";

// The NIR report stops its photo stage at a deadline. Once the caller's signal
// fires, no further photo may be signed or downloaded: a storage stall would
// otherwise keep signing every remaining row for minutes.
const signStoredMediaUrl = vi.fn(async (url: string | null | undefined) =>
  url ? `${url}?token=signed` : url,
);
vi.mock("@/lib/storage/sign-stored-url", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage/sign-stored-url")>()),
  signStoredMediaUrl: (u: string | null | undefined) => signStoredMediaUrl(u),
}));

import { prepareReportPhotos } from "../inspection-photos-to-images";

const HOST = "https://abc.supabase.co";
const JPG_SIG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    inspectionId: "insp-1",
    url: `${HOST}/storage/v1/object/public/evidence-optimised/org-1/insp-1/${i}.jpg`,
  }));
const ok = () => new Response(JPG_SIG.slice(), { status: 200 });

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", HOST);
  signStoredMediaUrl.mockClear();
});

describe("prepareReportPhotos stops when its signal fires", () => {
  it("starts no further photo after the signal fires and counts each one as stopped", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async () => {
      controller.abort();
      return ok();
    });

    const out = await prepareReportPhotos(rows(4), {
      inspectionId: "insp-1",
      ownerFolders: ["org-1"],
      fetchImpl: fetchImpl as unknown as typeof fetch,
      concurrency: 1,
      signal: controller.signal,
    });

    expect(out.photos).toHaveLength(1);
    expect(out.missing).toBe(3);
    expect(out.reasons).toEqual({ stopped: 3 });
    expect(signStoredMediaUrl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("an already aborted signal signs and fetches nothing", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn(async () => ok());

    const out = await prepareReportPhotos(rows(3), {
      inspectionId: "insp-1",
      ownerFolders: ["org-1"],
      fetchImpl: fetchImpl as unknown as typeof fetch,
      signal: controller.signal,
    });

    expect(out.photos).toHaveLength(0);
    expect(out.reasons).toEqual({ stopped: 3 });
    expect(signStoredMediaUrl).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
