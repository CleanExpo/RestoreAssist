const DEFAULT_API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ?? "https://restoreassist.app";

export function buildHealthCheckUrl(apiBase = DEFAULT_API_BASE): string {
  return `${apiBase.replace(/\/+$/, "")}/api/health`;
}

export async function checkApiReachability(
  apiBase = DEFAULT_API_BASE,
): Promise<boolean> {
  try {
    const response = await fetch(buildHealthCheckUrl(apiBase), {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    return response.ok;
  } catch {
    return false;
  }
}
