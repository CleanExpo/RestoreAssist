/**
 * Typed-signature image generator (client portal Phase 3b).
 *
 * The format is owned by `lib/signatures/signature-format.ts` (RA-8604) so the
 * portal writer, the signing routes and the PDF maker share one definition.
 * The legal capture (IP/UA, timestamp, atomic completion) is handled by the
 * sign route — this only produces the visual mark.
 */
export { typedSignatureDataUrl } from "@/lib/signatures/signature-format";
