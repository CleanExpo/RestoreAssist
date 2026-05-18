import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role: string;
      mustChangePassword?: boolean;
      organizationId?: string | null;
      userType?: string; // 'contractor' | 'client'
      clientId?: string | null; // For client users - the Client record ID
      contractorId?: string | null; // For client users - the contractor who owns this client
      needsOnboarding?: boolean; // RA-1259: new Google OAuth signups need account-type capture
    };
  }

  interface User {
    role: string;
    mustChangePassword?: boolean;
    organizationId?: string | null;
    userType?: string;
    clientId?: string | null;
    contractorId?: string | null;
    needsOnboarding?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: string;
    mustChangePassword?: boolean;
    organizationId?: string | null;
    userType?: string;
    clientId?: string | null;
    contractorId?: string | null;
    needsOnboarding?: boolean;
    // RA-4984 — subscription claims stamped in jwt() so middleware
    // can enforce the hard-paywall in edge runtime without Prisma.
    subscriptionStatus?: "TRIAL" | "ACTIVE" | "CANCELED" | "EXPIRED" | "PAST_DUE" | null;
    trialEndsAt?: string | null;
    lifetimeAccess?: boolean | null;
  }
}
