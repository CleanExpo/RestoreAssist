// Planted defect: a crash dressed as 503 with no statement of what is unavailable.
export async function GET() {
  return Response.json({ error: "Internal error" }, { status: 503 });
}
