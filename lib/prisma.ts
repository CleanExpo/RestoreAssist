import { PrismaClient } from "@prisma/client"

declare global {
  var prisma: PrismaClient | undefined
}

export const prisma = globalThis.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ['query', 'error', 'warn'] : ['error'],
})

// CRITICAL: Cache the client in all environments (including production)
// to prevent exhausting the connection pool in serverless environments
globalThis.prisma = prisma
