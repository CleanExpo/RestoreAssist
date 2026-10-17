/**
 * RA-8001 [AC1t] compile-time fixture for callAI's required keyPolicy.
 *
 * Checked by `npm run type-check` (inside tsconfig's include, outside its
 * test excludes); never imported or executed. If keyPolicy ever gains a
 * default or becomes optional, the directive below is unused and tsc fails.
 * The twin call must compile, which proves this file is type-checked at all.
 */
import { callAI } from "./ai-bridge";

export function keyPolicyIsRequired(): void {
  void (async () => {
    // @ts-expect-error keyPolicy is required: no default, no fallback to the platform key.
    await callAI({
      userId: "user",
      agentSlug: "report-analysis",
      systemPrompt: "system",
      userPrompt: "prompt",
    });

    await callAI({
      userId: "user",
      agentSlug: "report-analysis",
      systemPrompt: "system",
      userPrompt: "prompt",
      keyPolicy: "byok-only",
    });
  });
}
