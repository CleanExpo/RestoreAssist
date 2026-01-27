import "next-auth"
import "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      image?: string | null
      role: string
      mustChangePassword?: boolean
      organizationId?: string | null
      userType?: string // 'contractor' | 'client'
      clientId?: string | null // For client users - the Client record ID
      contractorId?: string | null // For client users - the contractor who owns this client
    }
  }

  interface User {
    role: string
    mustChangePassword?: boolean
    organizationId?: string | null
    userType?: string
    clientId?: string | null
    contractorId?: string | null
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: string
    mustChangePassword?: boolean
    organizationId?: string | null
    userType?: string
    clientId?: string | null
    contractorId?: string | null
  }
}
