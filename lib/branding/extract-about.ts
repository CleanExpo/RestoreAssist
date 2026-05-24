import { routeBasic } from "@/lib/ai/model-router";

const PROMPT = `You are summarising an Australian water-damage-restoration company's homepage for their CRM profile.
Write ONE professional paragraph (40-80 words) describing what they do, who they serve, and where.
Return JSON: { "text": string, "confidence": number 0-1 }.
Hero text:
---
{HERO}
---`;

export async function extractAboutCopy(
  hero: string,
): Promise<{ paragraph: string; confidence: number } | null> {
  if (!hero || hero.trim().length < 20) return null;
  const filled = PROMPT.replace("{HERO}", hero.slice(0, 1200));
  try {
    const result = await routeBasic(filled, { responseFormat: "json" });
    if (
      !result ||
      typeof result.text !== "string" ||
      typeof result.confidence !== "number"
    )
      return null;
    if (result.confidence < 0.5) return null;
    return { paragraph: result.text.trim(), confidence: result.confidence };
  } catch {
    return null;
  }
}
