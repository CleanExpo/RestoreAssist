import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/reports",
  "/clients",
  "/settings",
  "/analytics",
  "/integrations",
  "/cost-libraries",
  "/help",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only run auth check on protected routes — everything else passes through
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );
  if (!isProtected) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    const signInUrl = new URL("/login", req.url);
    signInUrl.searchParams.set("callbackUrl", pathname + req.nextUrl.search);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}
