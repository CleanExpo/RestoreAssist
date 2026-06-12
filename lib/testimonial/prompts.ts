/**
 * Testimonial Engine — guided teleprompter prompts.
 *
 * Short, friendly prompts the homeowner reads while recording. Lightly
 * personalised with the claim context (job type + suburb) when available,
 * with a generic fallback otherwise. Pure — no I/O.
 */

export function teleprompterPrompts(ctx: {
  jobType?: string;
  suburb?: string;
}): string[] {
  const place = ctx.suburb ? ` in ${ctx.suburb}` : "";
  const job = ctx.jobType ? ctx.jobType.toLowerCase() : "the damage";
  return [
    `What was the situation when you first found ${job}${place}?`,
    `How did the team handle it for you?`,
    `Would you recommend them — and why?`,
  ];
}
