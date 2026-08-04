/**
 * Social comment relevance gate for Margot / RestoreAssist.
 *
 * Phil request: stop engaging posts where "restoration" means cars, teeth,
 * art, furniture, hair, ecology, etc. Only engage property / insurance
 * disaster restoration. Fail closed when unsure.
 */

export type SocialRelevanceDecision = "engage" | "ignore" | "unsure";

export type SocialRelevanceInput = {
  text: string;
  hashtags?: string[];
  authorBio?: string;
  platform?: string;
};

export type SocialRelevanceResult = {
  decision: SocialRelevanceDecision;
  relevant: boolean;
  reason: string;
  positiveHits: string[];
  negativeHits: string[];
};

/** What restoration means for RestoreAssist / Unite-Group. */
export const PROPERTY_RESTORATION_DEFINITION = `
RestoreAssist restoration = property / building / disaster restoration after
water, flood, storm, fire or smoke, mould, sewage, or biohazard. It includes
insurance claims work, IICRC-aligned drying and remediation, contents,
make-safe, and field-to-office workflows for restoration contractors,
assessors, insurers, and property managers (AU/NZ focus).
`.trim();

const POSITIVE_SIGNALS: { label: string; pattern: RegExp }[] = [
  { label: "water damage", pattern: /\bwater\s*damage\b/i },
  { label: "flood", pattern: /\bflood(ed|ing)?\b/i },
  { label: "storm damage", pattern: /\bstorm\s*(damage|claim)?\b/i },
  { label: "burst pipe", pattern: /\bburst\s*pipes?\b/i },
  { label: "fire damage", pattern: /\bfire\s*damage\b/i },
  { label: "smoke damage", pattern: /\bsmoke\s*(damage|odou?r)?\b/i },
  { label: "mould", pattern: /\bmoul?d(y|ing)?\b/i },
  { label: "remediation", pattern: /\bremediation\b/i },
  { label: "IICRC", pattern: /\biicrc\b|\bs500\b|\bs520\b/i },
  { label: "structural drying", pattern: /\b(structural\s*)?drying\b/i },
  { label: "moisture", pattern: /\bmoisture\s*(map|reading|meter)?\b/i },
  { label: "insurance claim", pattern: /\b(insurance|insurer|adjuster|claim)\b/i },
  { label: "contents", pattern: /\bcontents\s*(restore|restoration|pack)?\b/i },
  { label: "make-safe", pattern: /\bmake[-\s]?safe\b/i },
  {
    label: "restoration contractor",
    pattern: /\brestoration\s*(contractor|company|firm|crew|tech)\b/i,
  },
  {
    label: "property restoration",
    pattern: /\b(property|building|home|house|commercial)\s+restoration\b/i,
  },
  { label: "disaster restoration", pattern: /\bdisaster\s+restoration\b/i },
  { label: "sewage", pattern: /\bsewage|category\s*[123]\b/i },
  { label: "biohazard", pattern: /\bbiohazard|trauma\s*scene\b/i },
  { label: "mitigation", pattern: /\bmitigation\b/i },
];

const NEGATIVE_SIGNALS: { label: string; pattern: RegExp }[] = [
  {
    label: "car restoration",
    pattern:
      /\b(car|auto|automotive|vehicle|classic\s*car|muscle\s*car|motorcycle|bike|boat|yacht)\s+restoration\b/i,
  },
  {
    label: "vehicle restore",
    pattern:
      /\brestor(e|ing|ation|ed)\b[\s\S]{0,40}\b(car|auto|automotive|vehicle|toyota|hilux|ute|truck|mustang|motorbike|motorcycle|boat)\b/i,
  },
  {
    label: "vehicle subject",
    pattern:
      /\b(car|auto|automotive|vehicle|toyota|hilux|ute|truck|mustang|motorbike|motorcycle)\b[\s\S]{0,40}\brestor(e|ing|ation|ed)\b/i,
  },
  {
    label: "rusted vehicle body",
    pattern: /\brusted?\b[\s\S]{0,30}\b(body|panel|chassis|hilux|ute|truck|car)\b/i,
  },
  { label: "auto body", pattern: /\b(auto\s*body|body\s*shop|panel\s*beat)\b/i },
  {
    label: "dental",
    pattern:
      /\b(teeth|tooth|dental|dentist|veneer|orthodont|smile|implant)\b.*\b(restor(e|ation|ing)|crown|veneer)/i,
  },
  {
    label: "dental short",
    pattern: /\b(teeth|tooth|dental|dentist|veneer|orthodont|smile)\s+restor/i,
  },
  { label: "tooth restore", pattern: /\brestor(e|ation)\s+(teeth|tooth|dental|smile)\b/i },
  { label: "art restoration", pattern: /\b(art|painting|fresco|sculpture)\s+restoration\b/i },
  { label: "furniture", pattern: /\b(furniture|antique)\s+(restoration|refinish)/i },
  { label: "hair restoration", pattern: /\b(hair|scalp)\s+(restoration|transplant)\b/i },
  { label: "ecosystem", pattern: /\b(ecosystem|habitat|reef|wetland|rewild)\b/i },
  { label: "film restoration", pattern: /\b(film|movie|cinema|4k)\s+restoration\b/i },
  { label: "watch/jewelry", pattern: /\b(watch|jewelry|jewellery|timepiece)\s+restoration\b/i },
  { label: "data restore", pattern: /\b(data|backup|factory)\s+restor(e|ation)\b/i },
  { label: "software restore", pattern: /\brestor(e|ation)\s+(windows|mac|iphone|android|pc)\b/i },
  { label: "garage hobby", pattern: /\b(garage\s*build|barn\s*find|hot\s*rod)\b/i },
  {
    label: "wrong hashtag",
    pattern:
      /#(car|auto|automotive|dental|teeth|smile|hair|art|furniture|film|watch)restoration\b/i,
  },
];

/**
 * True when the user is asking Margot to draft / post a social comment.
 * Phil's gate applies here — not to ordinary product help questions.
 */
export function isSocialCommentDraftRequest(text: string): boolean {
  return (
    /\b(draft|write|compose|suggest|craft)\b[\s\S]{0,60}\b(comment|reply|response)\b/i.test(
      text,
    ) ||
    /\b(comment|reply)\s+on\s+(this|a|the|my)\b/i.test(text) ||
    /\b(linkedin|facebook|instagram|twitter|\bx\b)\b[\s\S]{0,40}\b(comment|reply|post)\b/i.test(
      text,
    ) ||
    /\b(social\s*(media|post|comment)|post\s+a\s+comment)\b/i.test(text)
  );
}

/**
 * When Margot is asked to draft a social reply on a wrong-industry post,
 * refuse with a short trained explanation (what restoration means for us).
 * Ordinary help questions (e.g. car tips as product chat) are left to the LLM.
 */
export function resolveSocialCommentChatGate(userMessage: string): {
  applyGate: boolean;
  canDraft: boolean;
  assessment: SocialRelevanceResult | null;
  refuseReply: string | null;
} {
  if (!isSocialCommentDraftRequest(userMessage)) {
    return {
      applyGate: false,
      canDraft: false,
      assessment: null,
      refuseReply: null,
    };
  }

  const assessment = assessSocialRestorationRelevance({ text: userMessage });
  if (assessment.relevant) {
    return {
      applyGate: true,
      canDraft: true,
      assessment,
      refuseReply: null,
    };
  }

  const industryHint =
    assessment.negativeHits.length > 0
      ? ` That looks like ${assessment.negativeHits[0]}, not property work.`
      : "";

  return {
    applyGate: true,
    canDraft: false,
    assessment,
    refuseReply:
      `I will not draft a social comment on that.${industryHint} ` +
      `For RestoreAssist, restoration means property and insurance work after water, flood, storm, fire, smoke, mould, or sewage - not cars, teeth, furniture, art, or other industries.`,
  };
}

/** @deprecated Use resolveSocialCommentChatGate — social gate only, not all chat. */
export function shouldHardSkipWrongIndustryRestoration(text: string): boolean {
  const gate = resolveSocialCommentChatGate(text);
  return gate.applyGate && !gate.canDraft;
}

function collectHits(
  haystack: string,
  signals: { label: string; pattern: RegExp }[],
): string[] {
  const hits: string[] = [];
  for (const s of signals) {
    if (s.pattern.test(haystack)) hits.push(s.label);
  }
  return hits;
}

/**
 * Decide whether Margot may reply to a social post.
 * Bare "restoration" alone is never enough to engage.
 */
export function assessSocialRestorationRelevance(
  input: SocialRelevanceInput,
): SocialRelevanceResult {
  const parts = [
    input.text ?? "",
    ...(input.hashtags ?? []).map((h) => (h.startsWith("#") ? h : `#${h}`)),
    input.authorBio ?? "",
  ];
  const haystack = parts.join("\n").trim();

  if (!haystack) {
    return {
      decision: "unsure",
      relevant: false,
      reason: "Empty post - fail closed",
      positiveHits: [],
      negativeHits: [],
    };
  }

  const negativeHits = collectHits(haystack, NEGATIVE_SIGNALS);
  const positiveHits = collectHits(haystack, POSITIVE_SIGNALS);
  const mentionsRestoration = /\brestor(e|ation|ing|ed)\b/i.test(haystack);

  if (negativeHits.length > 0 && positiveHits.length === 0) {
    return {
      decision: "ignore",
      relevant: false,
      reason: `Wrong-industry signals: ${negativeHits.join(", ")}`,
      positiveHits,
      negativeHits,
    };
  }

  // Mixed signals (e.g. car + water) → fail closed
  if (negativeHits.length > 0 && positiveHits.length > 0) {
    return {
      decision: "unsure",
      relevant: false,
      reason: `Mixed signals (negative: ${negativeHits.join(", ")}; positive: ${positiveHits.join(", ")}) - fail closed`,
      positiveHits,
      negativeHits,
    };
  }

  if (positiveHits.length > 0) {
    return {
      decision: "engage",
      relevant: true,
      reason: `Property restoration context: ${positiveHits.join(", ")}`,
      positiveHits,
      negativeHits,
    };
  }

  if (mentionsRestoration) {
    return {
      decision: "ignore",
      relevant: false,
      reason:
        'Bare "restoration" without property-damage context - do not engage',
      positiveHits,
      negativeHits,
    };
  }

  return {
    decision: "unsure",
    relevant: false,
    reason: "No clear property restoration signals - fail closed",
    positiveHits,
    negativeHits,
  };
}

/** Convenience: true only when decision is engage. */
export function shouldEngageSocialPost(input: SocialRelevanceInput): boolean {
  return assessSocialRestorationRelevance(input).relevant;
}
