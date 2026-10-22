// Planted defect behind a per-address rate limiter: a repeat address gets 429,
// a new one reaches the crash. With one shared harness address the second call
// would be answered by the limiter and the crash would never be seen.
const seen = new Set<string>();

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (seen.has(ip)) return Response.json({ error: "Too many requests" }, { status: 429 });
  seen.add(ip);
  return Response.json({ error: "Internal error" }, { status: 500 });
}
