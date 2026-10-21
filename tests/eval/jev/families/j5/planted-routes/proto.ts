// Planted defect: a recursive merge of the request body that follows __proto__.
import { NextResponse } from "next/server";

function merge(target: Record<string, any>, src: Record<string, any>) {
  for (const k in src) {
    if (src[k] && typeof src[k] === "object") {
      if (!target[k] || typeof target[k] !== "object") target[k] = {};
      merge(target[k], src[k]);
    } else target[k] = src[k];
  }
  return target;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  merge({}, body);
  return NextResponse.json({ ok: true });
}
