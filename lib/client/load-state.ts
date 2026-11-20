/**
 * RA-8084: a failed read must never look like an empty successful read.
 *
 * An empty-account message ("No clients yet", "Create your first report") is
 * only true when the load succeeded and returned nothing. When the load failed
 * the contents are unknown, so the page shows the load error and Retry instead.
 */
export function isConfirmedEmpty(
  loadError: string | null | undefined,
  count: number,
): boolean {
  return !loadError && count === 0;
}
