/**
 * Human social-reply style for Margot.
 * Replies must not look AI-generated and must not contain apostrophes,
 * em dashes, or en dashes.
 */

const APOSTROPHE = /['\u2018\u2019\u02BC]/g;
const EM_DASH = /\u2014/g;
const EN_DASH = /\u2013/g;
const FANCY_QUOTES = /[\u201C\u201D\u201E\u201F]/g;

const CONTRACTION_MAP: [RegExp, string][] = [
  [/\bI'm\b/gi, "I am"],
  [/\bI've\b/gi, "I have"],
  [/\bI'll\b/gi, "I will"],
  [/\bI'd\b/gi, "I would"],
  [/\byou're\b/gi, "you are"],
  [/\byou've\b/gi, "you have"],
  [/\byou'll\b/gi, "you will"],
  [/\byou'd\b/gi, "you would"],
  [/\bwe're\b/gi, "we are"],
  [/\bwe've\b/gi, "we have"],
  [/\bwe'll\b/gi, "we will"],
  [/\bwe'd\b/gi, "we would"],
  [/\bthey're\b/gi, "they are"],
  [/\bthey've\b/gi, "they have"],
  [/\bthey'll\b/gi, "they will"],
  [/\bthey'd\b/gi, "they would"],
  [/\bit's\b/gi, "it is"],
  [/\bthat's\b/gi, "that is"],
  [/\bwhat's\b/gi, "what is"],
  [/\bwho's\b/gi, "who is"],
  [/\bwhere's\b/gi, "where is"],
  [/\bthere's\b/gi, "there is"],
  [/\bhere's\b/gi, "here is"],
  [/\bdon't\b/gi, "do not"],
  [/\bdoesn't\b/gi, "does not"],
  [/\bdidn't\b/gi, "did not"],
  [/\bcan't\b/gi, "cannot"],
  [/\bcouldn't\b/gi, "could not"],
  [/\bwon't\b/gi, "will not"],
  [/\bwouldn't\b/gi, "would not"],
  [/\bshouldn't\b/gi, "should not"],
  [/\bisn't\b/gi, "is not"],
  [/\baren't\b/gi, "are not"],
  [/\bwasn't\b/gi, "was not"],
  [/\bweren't\b/gi, "were not"],
  [/\bhaven't\b/gi, "have not"],
  [/\bhasn't\b/gi, "has not"],
  [/\bhadn't\b/gi, "had not"],
  [/\blet's\b/gi, "let us"],
];

export type SocialReplyStyleCheck = {
  ok: boolean;
  issues: string[];
  sanitized: string;
};

/** Expand common contractions, then strip remaining forbidden punctuation. */
export function sanitizeSocialReply(text: string): string {
  let out = text.trim();
  for (const [re, replacement] of CONTRACTION_MAP) {
    out = out.replace(re, replacement);
  }
  // Possessives like team's → team
  out = out.replace(/([A-Za-z]+)'s\b/g, "$1");
  out = out.replace(APOSTROPHE, "");
  out = out.replace(EM_DASH, ". ");
  out = out.replace(EN_DASH, "-");
  out = out.replace(FANCY_QUOTES, '"');
  // Collapse leftover double spaces from dash swaps
  out = out.replace(/\s{2,}/g, " ").replace(/\.\s*\./g, ".");
  return out.trim();
}

export function checkSocialReplyStyle(text: string): SocialReplyStyleCheck {
  const issues: string[] = [];
  if (/['\u2018\u2019\u02BC]/.test(text)) {
    issues.push("Contains apostrophe");
  }
  if (text.includes("\u2014") || text.includes("—")) {
    issues.push("Contains em dash");
  }
  if (text.includes("\u2013") || text.includes("–")) {
    issues.push("Contains en dash");
  }
  if (/[\u201C\u201D]/.test(text)) {
    issues.push("Contains fancy quotes");
  }
  if (/\b(as an AI|language model|I am an assistant|I am a bot)\b/i.test(text)) {
    issues.push("Sounds like an AI disclaimer");
  }
  if (
    /\b(excited to|leverage|delve|game-?changer|streamline your workflow)\b/i.test(
      text,
    )
  ) {
    issues.push("Sounds like marketing / AI buzzword copy");
  }

  const sanitized = sanitizeSocialReply(text);
  const stillBad = /['\u2018\u2019\u2014\u2013\u02BC]/.test(sanitized);

  return {
    ok: issues.length === 0 && !stillBad,
    issues: stillBad
      ? [...issues, "Sanitized text still has forbidden punctuation"]
      : issues,
    sanitized,
  };
}

/** Final gate before posting a drafted reply. */
export function prepareSocialReply(draft: string): {
  canPost: boolean;
  text: string;
  issues: string[];
} {
  const { sanitized, issues } = checkSocialReplyStyle(draft);
  const recheck = checkSocialReplyStyle(sanitized);
  return {
    canPost: recheck.issues.length === 0,
    text: sanitized,
    issues: [...new Set([...issues, ...recheck.issues])],
  };
}
