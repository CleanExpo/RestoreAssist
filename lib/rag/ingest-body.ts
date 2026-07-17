/**
 * Shared Zod body for standards RAG ingest (cron bearer + admin session).
 */

import { z } from "zod";

export const ragIngestBodySchema = z.object({
  standard: z
    .string()
    .min(2)
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/),
  edition: z
    .string()
    .min(1)
    .max(10)
    .regex(/^[A-Za-z0-9.-]+$/),
  provenance: z
    .enum(["authoritative-standard", "knowledge"])
    .default("authoritative-standard"),
  jurisdiction: z.string().min(2).max(5).default("AU"),
  files: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        text: z.string().min(1).max(1_500_000),
      }),
    )
    .min(1)
    .max(50),
});

export type RagIngestBody = z.infer<typeof ragIngestBodySchema>;
