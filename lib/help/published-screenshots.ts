/**
 * Cloudinary public IDs of help-article screenshots that have actually been
 * uploaded (RA-8403).
 *
 * Help articles name their screenshots by Cloudinary public ID. On 21/11/2026
 * none of the 23 IDs in data/content/help resolved: every one returned 404 on
 * the production cloud, so eight public articles showed broken images. A
 * screenshot now renders only when its ID is listed here.
 *
 * To publish one: upload the image to the production cloud under its ID,
 * confirm the delivery URL returns 200, then add the ID below.
 */
export const PUBLISHED_HELP_SCREENSHOTS: ReadonlySet<string> = new Set<string>(
  [],
);

export function isPublishedHelpScreenshot(
  publicId: string,
  published: ReadonlySet<string> = PUBLISHED_HELP_SCREENSHOTS,
): boolean {
  return published.has(publicId);
}
