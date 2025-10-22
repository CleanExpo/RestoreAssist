import DOMPurify from 'dompurify';

/**
 * Sanitize plain text input by stripping all HTML tags and attributes.
 * Use this for form fields that should only contain plain text.
 *
 * @param input - The raw user input to sanitize
 * @returns Sanitized string with all HTML removed
 */
export function sanitizeInput(input: string): string {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: []
  });
}

/**
 * Sanitize HTML content while allowing basic formatting tags.
 * Use this for rich text fields that need basic formatting like bold, italic, paragraphs.
 *
 * @param html - The HTML content to sanitize
 * @returns Sanitized HTML with only safe tags and no attributes
 */
export function sanitizeHTML(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br'],
    ALLOWED_ATTR: []
  });
}
