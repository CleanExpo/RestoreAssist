import fs from "fs";
import path from "path";

export interface ResourceArticle {
  slug: string;
  title: string;
  uploadDate: string; // ISO 8601 with AEST timezone
  duration: string; // ISO 8601 duration e.g. "PT14M22S"
  embedUrl: string; // https://www.youtube.com/embed/VIDEO_ID
  thumbnailUrl: string[]; // [1x1, 4x3, 16x9]
  description: string;
  keywords: string[];
  author: string; // "Phill McGurk | RestoreAssist"
  transcript: string; // Full article body in markdown
}

const CONTENT_DIR = path.join(process.cwd(), "content", "resources");

export async function getAllResources(): Promise<ResourceArticle[]> {
  // Guard: if the directory doesn't exist return empty array
  if (!fs.existsSync(CONTENT_DIR)) {
    return [];
  }

  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".json"));

  const resources = files.map((file) => {
    const raw = fs.readFileSync(path.join(CONTENT_DIR, file), "utf-8");
    const data = JSON.parse(raw) as ResourceArticle & { youtubeId?: string };
    // Derive embedUrl from youtubeId if not already present
    if (!data.embedUrl && data.youtubeId) {
      data.embedUrl = `https://www.youtube.com/embed/${data.youtubeId}`;
    } else if (!data.embedUrl) {
      data.embedUrl = "";
    }
    return data as ResourceArticle;
  });

  // Sort newest first by uploadDate
  return resources.sort(
    (a, b) =>
      new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime(),
  );
}

export async function getResourceBySlug(
  slug: string,
): Promise<ResourceArticle | null> {
  const resources = await getAllResources();
  return resources.find((r) => r.slug === slug) ?? null;
}
