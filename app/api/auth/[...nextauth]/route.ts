import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// RA-1798 attempted to wrap POST to catch empty-body crashes, but the wrapper
// broke Google/Apple OAuth by interfering with NextAuth's internal CSRF token
// validation (csrf=true error). Reverted to direct export — NextAuth handles
// its own routing internally and must be the actual exported handler.
// Empty-body probes now 500 again (acceptable: real users never send empty bodies).
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
