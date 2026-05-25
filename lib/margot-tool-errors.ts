export interface MargotToolError {
  error: string;
  retryable: boolean;
}

export function formatDeepResearchFailure(err: unknown): MargotToolError {
  const message = err instanceof Error ? err.message : String(err);
  const retryable =
    /rate|quota|timeout|network|ECONN|5\d\d|unavailable/i.test(message);

  return {
    error: "deep_research failed",
    retryable,
  };
}

export function formatImageGenerateFailure(err: unknown): MargotToolError {
  const message = err instanceof Error ? err.message : String(err);
  const retryable =
    /rate|quota|timeout|network|ECONN|5\d\d|unavailable/i.test(message);

  return {
    error: "image_generate failed",
    retryable,
  };
}
