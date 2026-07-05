import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Keep the heavy deps inert — the SSRF guard must reject before either is used.
const generateContent = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));
vi.mock("../supabase-server", () => ({
  getSupabaseServerClient: vi.fn(),
}));

import { generateAndStoreImage } from "../margot-image-gen";

describe("generateAndStoreImage — reference_image_url SSRF guard", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn<typeof globalThis, "fetch">>;

  beforeEach(() => {
    // Re-install per test (afterEach restores it). If the guard is removed the
    // call reaches this reject and surfaces as a distinct (retryable) failure,
    // so every assertion below fails loudly rather than hitting the network.
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network: guard bypassed"));
    process.env.GEMINI_API_KEY = "test-key";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a cloud-metadata reference URL without fetching it", async () => {
    const result = await generateAndStoreImage({
      prompt: "a house",
      reference_image_url: "http://169.254.169.254/latest/meta-data/",
    });

    expect(result).toEqual({ error: "image_generate failed", retryable: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a loopback reference URL without fetching it", async () => {
    const result = await generateAndStoreImage({
      prompt: "a house",
      reference_image_url: "http://127.0.0.1:8080/admin",
    });

    expect(result).toEqual({ error: "image_generate failed", retryable: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a non-http scheme reference URL without fetching it", async () => {
    const result = await generateAndStoreImage({
      prompt: "a house",
      reference_image_url: "file:///etc/passwd",
    });

    expect(result).toEqual({ error: "image_generate failed", retryable: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a redirect that bounces a public URL to an internal host", async () => {
    // A public host is allowed on the first hop, but 302s to cloud metadata.
    // The manual-redirect guard must re-validate and refuse the second hop.
    const redirect = {
      status: 302,
      ok: false,
      headers: new Headers({
        location: "http://169.254.169.254/latest/meta-data/",
      }),
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as Response;
    fetchSpy.mockReset();
    fetchSpy.mockResolvedValue(redirect);

    const result = await generateAndStoreImage({
      prompt: "a house",
      reference_image_url: "https://cdn.example.com/logo.png",
    });

    expect(result).toEqual({ error: "image_generate failed", retryable: false });
    // First hop fetched the public URL with manual redirects; the internal
    // redirect target is re-validated and never fetched.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://cdn.example.com/logo.png",
      expect.objectContaining({ redirect: "manual" }),
    );
  });
});
