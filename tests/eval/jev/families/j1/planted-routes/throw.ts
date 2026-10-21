// Planted defect: an uncaught throw, which Next turns into a 500.
export async function POST(req: Request) {
  const body = await req.json();
  return Response.json(body);
}
