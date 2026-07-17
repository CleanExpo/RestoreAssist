/**
 * Portal content helpers — fetch published articles and render simple markdown.
 */

export interface PortalContentRow {
  id: string;
  category: string;
  slug: string;
  mdxContent: string;
  videoSlug: string | null;
}

export type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string };

/** Split markdown into headings (##) and paragraphs — no full MDX engine. */
export function parseSimpleMarkdown(content: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = content.split(/\r?\n/);
  let paragraph: string[] = [];

  const flushParagraph = () => {
    const text = paragraph.join(" ").trim();
    if (text) blocks.push({ type: "paragraph", text });
    paragraph = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      continue;
    }
    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      blocks.push({
        type: "heading",
        level: heading[1].length,
        text: heading[2].trim(),
      });
      continue;
    }
    paragraph.push(trimmed);
  }
  flushParagraph();
  return blocks;
}

export const PORTAL_CONTENT_SCOPES = ["PLATFORM_DEFAULT"] as const;
