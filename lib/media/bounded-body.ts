/**
 * Read a request body while counting the bytes that actually arrive.
 * Content-Length is client-supplied and is never trusted. Returns null as
 * soon as the real stream passes `maxBytes`, cancelling the rest of the read.
 */
export async function readBoundedBody(
  request: Request,
  maxBytes: number,
): Promise<Buffer | null> {
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
  }
  return Buffer.concat(chunks, total);
}

/** Parse multipart form data from already-bounded bytes. */
export function formDataFromBytes(
  request: Request,
  bytes: Buffer,
): Promise<FormData> {
  return new Response(new Uint8Array(bytes), {
    headers: { "content-type": request.headers.get("content-type") ?? "" },
  }).formData();
}
