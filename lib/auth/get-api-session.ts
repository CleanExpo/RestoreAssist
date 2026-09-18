import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";

/**
 * Route-handler session. NextAuth `getServerSession` reads `cookies()` from
 * `next/headers`. In some App Router turns that store is empty while the
 * request still carries `next-auth.session-token`, so /dashboard looks
 * signed-in and every API returns 401. Fall back to the request JWT.
 */
export async function getApiSession(request?: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) return session;
  if (!request) return session;

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });
  if (!token?.sub || (token as { revoked?: boolean }).revoked) {
    return session;
  }

  const customExp = (token as { customExp?: number }).customExp;
  if (
    typeof customExp === "number" &&
    Math.floor(Date.now() / 1000) > customExp
  ) {
    return null;
  }

  return {
    ...session,
    user: {
      ...(session?.user ?? {}),
      id: token.sub,
      email: token.email ?? session?.user?.email,
      name: token.name ?? session?.user?.name,
      image:
        (token.picture as string | undefined) ??
        (session?.user as { image?: string } | undefined)?.image,
      role: (token as { role?: string }).role,
    },
    expires: session?.expires ?? new Date(Date.now() + 60_000).toISOString(),
  };
}
