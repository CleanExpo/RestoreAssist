interface CloseJobVisibilityInput {
  role?: string | null;
  status: string;
  completedAt?: string | null;
}

export function shouldRenderCloseJobPrompt({
  role,
  status,
  completedAt,
}: CloseJobVisibilityInput): boolean {
  // The parent route is authenticated; completed summaries are read-only and
  // remain visible regardless of which authenticated role originally closed it.
  if (completedAt) return true;

  return status === "IN_BILLING" && (role === "MANAGER" || role === "ADMIN");
}
