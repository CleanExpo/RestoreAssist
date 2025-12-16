import { NextAuthOptions } from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import GoogleProvider from "next-auth/providers/google"
import CredentialsProvider from "next-auth/providers/credentials"
import { prisma } from "./prisma"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"

// Safe logger import with fallback
let logger: any
try {
  logger = require("./logger").logger
} catch (e) {
  logger = {
    info: (msg: string, ctx?: any) => console.log(`[INFO] ${msg}`, ctx || ''),
    warn: (msg: string, ctx?: any) => console.warn(`[WARN] ${msg}`, ctx || ''),
    error: (msg: string, err?: any, ctx?: any) => console.error(`[ERROR] ${msg}`, err, ctx || ''),
    debug: () => {}
  }
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        const startTime = Date.now()
        try {
          logger.info('Login attempt', { email: credentials?.email })
        } catch (e) {}

        if (!credentials?.email || !credentials?.password) {
          try {
            logger.warn('Login failed: missing credentials', { hasEmail: !!credentials?.email, hasPassword: !!credentials?.password })
          } catch (e) {}
          return null
        }

        const user = await prisma.user.findUnique({
          where: {
            email: credentials.email
          }
        })

        if (!user || !user.password) {
          try {
            logger.warn('Login failed: user not found', { email: credentials.email })
          } catch (e) {}
          return null
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.password
        )

        if (!isPasswordValid) {
          try {
            logger.warn('Login failed: invalid password', { email: credentials.email, userId: user.id })
          } catch (e) {}
          return null
        }

        const duration = Date.now() - startTime
        try {
          logger.info('Login successful', { userId: user.id, email: user.email, duration: `${duration}ms` })
        } catch (e) {}

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
        }
      }
    })
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role
        try {
          logger.debug('JWT token created', { userId: user.id, role: user.role })
        } catch (e) {}
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.sub!
        session.user.role = token.role as string
        try {
          logger.debug('Session created', { userId: token.sub, role: token.role })
        } catch (e) {}
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
    signUp: "/signup",
  },
  secret: process.env.NEXTAUTH_SECRET,
}
