import { NextAuthOptions } from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import GoogleProvider from "next-auth/providers/google"
import CredentialsProvider from "next-auth/providers/credentials"
import { prisma } from "./prisma"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { logSecurityEvent } from '@/lib/security-audit'

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
        if (!credentials?.email) {
          console.log('[Credentials] No email provided')
          return null
        }

        const user = await prisma.user.findUnique({
          where: {
            email: credentials.email
          },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            role: true,
            password: true,
            mustChangePassword: true,
            organizationId: true
          }
        })

        if (!user) {
          console.log('[Credentials] User not found:', credentials.email)
          logSecurityEvent({
            eventType: 'LOGIN_FAILED',
            severity: 'WARNING',
            email: credentials.email,
            details: { reason: 'user_not_found' },
          }).catch(() => {})
          return null
        }

        // Handle Google users (no password provided or empty string)
        // Check if password is missing, empty string, or undefined
        const isPasswordEmpty = !credentials.password || credentials.password.trim() === ''
        
        if (isPasswordEmpty) {
          // Check if user was created via Google (no password set in DB)
          if (!user.password) {
            console.log('[Credentials] Google user authenticated:', credentials.email)
            logSecurityEvent({
              eventType: 'LOGIN_SUCCESS',
              userId: user.id,
              email: user.email!,
              details: { method: 'google_passthrough' },
            }).catch(() => {})
            return {
              id: user.id,
              email: user.email,
              name: user.name,
              image: user.image,
              role: user.role,
              mustChangePassword: user.mustChangePassword || false,
              organizationId: user.organizationId || null,
            }
          }
          // User has password but none provided - invalid
          console.log('[Credentials] Password required for user:', credentials.email)
          return null
        }

        // Regular password check for email/password users
        if (!user.password) {
          console.log('[Credentials] User has no password but password was provided:', credentials.email)
          return null
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.password
        )

        if (!isPasswordValid) {
          console.log('[Credentials] Invalid password for user:', credentials.email)
          logSecurityEvent({
            eventType: 'LOGIN_FAILED',
            severity: 'WARNING',
            userId: user.id,
            email: credentials.email,
            details: { reason: 'invalid_password' },
          }).catch(() => {})
          return null
        }

        console.log('[Credentials] User authenticated successfully:', credentials.email)
        logSecurityEvent({
          eventType: 'LOGIN_SUCCESS',
          userId: user.id,
          email: user.email!,
        }).catch(() => {})
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
          mustChangePassword: user.mustChangePassword || false,
          organizationId: user.organizationId || null,
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
        token.mustChangePassword = user.mustChangePassword || false
        token.organizationId = user.organizationId || null
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.sub!
        session.user.role = token.role as string
        session.user.mustChangePassword = (token.mustChangePassword as boolean) || false
        session.user.organizationId = (token.organizationId as string) || null
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
