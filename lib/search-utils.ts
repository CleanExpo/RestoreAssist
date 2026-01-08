/**
 * Search utilities for full-text search functionality
 */

/**
 * Debounce a function call
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function (...args: Parameters<T>) {
    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
}

/**
 * Parse and sanitize search query
 * - Trim whitespace
 * - Remove special characters that could cause SQL injection
 * - Ensure minimum length
 */
export function parseSearchQuery(query: string): string | null {
  const trimmed = query.trim();

  if (trimmed.length < 2) {
    return null;
  }

  // Replace special regex characters with escaped versions
  // Allow letters, numbers, spaces, and common punctuation
  const sanitized = trimmed.replace(/[^\w\s\-]/g, "").trim();

  if (sanitized.length < 2) {
    return null;
  }

  return sanitized;
}

/**
 * Convert a search query into PostgreSQL tsquery format
 * Handles multiple words and creates proper tsquery syntax
 */
export function toPostgresTsquery(query: string): string {
  // Split by spaces and filter empty strings
  const words = query.split(/\s+/).filter((w) => w.length > 0);

  if (words.length === 0) {
    return "";
  }

  // Join with & (AND operator in tsquery)
  return words.map((word) => `${word}:*`).join(" & ");
}

/**
 * Highlight search terms in text
 * Returns HTML with <mark> tags around matched terms
 */
export function highlightSearchTerms(text: string, query: string): string {
  if (!text || !query) {
    return text;
  }

  const words = query.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) {
    return text;
  }

  // Create a regex that matches any of the search words (case-insensitive)
  const pattern = new RegExp(`\\b(${words.join("|")})\\b`, "gi");

  return text.replace(pattern, "<mark>$1</mark>");
}

/**
 * Truncate text to a certain length, preserving word boundaries
 */
export function truncateText(text: string, maxLength: number = 150): string {
  if (text.length <= maxLength) {
    return text;
  }

  // Find the last space within the maxLength
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");

  if (lastSpace > 0) {
    return truncated.substring(0, lastSpace) + "...";
  }

  return truncated + "...";
}

/**
 * Format search results for API responses
 */
export interface SearchResult {
  id: string;
  type: "report" | "client" | "inspection";
  title: string;
  description?: string;
  url: string;
  metadata?: Record<string, any>;
}

export function formatSearchResults(results: SearchResult[]): SearchResult[] {
  return results.map((result) => ({
    ...result,
    description: result.description
      ? truncateText(result.description)
      : undefined,
  }));
}

/**
 * Validate search query parameters
 */
export interface SearchParams {
  q: string;
  limit?: number;
  offset?: number;
  status?: string;
  hazardType?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function validateSearchParams(params: Partial<SearchParams>): {
  valid: boolean;
  query?: string;
  errors?: string[];
} {
  const errors: string[] = [];

  // Check query
  const query = parseSearchQuery(params.q || "");
  if (!query) {
    errors.push("Search query must be at least 2 characters long");
    return { valid: false, errors };
  }

  // Check limit
  const limit = params.limit || 20;
  if (limit < 1 || limit > 100) {
    errors.push("Limit must be between 1 and 100");
  }

  // Check offset
  const offset = params.offset || 0;
  if (offset < 0) {
    errors.push("Offset must be non-negative");
  }

  // Check dates
  if (params.dateFrom) {
    const dateFrom = new Date(params.dateFrom);
    if (isNaN(dateFrom.getTime())) {
      errors.push("Invalid dateFrom format");
    }
  }

  if (params.dateTo) {
    const dateTo = new Date(params.dateTo);
    if (isNaN(dateTo.getTime())) {
      errors.push("Invalid dateTo format");
    }
  }

  if (params.dateFrom && params.dateTo) {
    const from = new Date(params.dateFrom);
    const to = new Date(params.dateTo);
    if (from > to) {
      errors.push("dateFrom must be before dateTo");
    }
  }

  return {
    valid: errors.length === 0,
    query,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Calculate relevance score for ranking results
 * Higher score = more relevant
 */
export function calculateRelevanceScore(
  text: string,
  query: string,
  field: "title" | "description"
): number {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  // Exact match in title: highest score
  if (field === "title" && lowerText === lowerQuery) {
    return 100;
  }

  // Starts with query: high score
  if (lowerText.startsWith(lowerQuery)) {
    return 80 + (field === "title" ? 10 : 0);
  }

  // Contains query: medium score
  if (lowerText.includes(lowerQuery)) {
    return 60 + (field === "title" ? 10 : 0);
  }

  // Word boundary match: lower score
  const pattern = new RegExp(`\\b${query}\\b`, "i");
  if (pattern.test(text)) {
    return 40 + (field === "title" ? 10 : 0);
  }

  return 0;
}
