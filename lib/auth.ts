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
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/drive.readonly',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
    CredentialsProvider({
      id: "contractor-credentials",
      name: "contractor-credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email) {
          console.log('[Contractor Credentials] No email provided')
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
          console.log('[Contractor Credentials] User not found:', credentials.email)
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
            console.log('[Contractor Credentials] Google user authenticated:', credentials.email)
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
              userType: 'contractor',
            }
          }
          // User has password but none provided - invalid
          console.log('[Contractor Credentials] Password required for user:', credentials.email)
          return null
        }

        // Regular password check for email/password users
        if (!user.password) {
          console.log('[Contractor Credentials] User has no password but password was provided:', credentials.email)
          return null
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.password
        )

        if (!isPasswordValid) {
          console.log('[Contractor Credentials] Invalid password for user:', credentials.email)
          logSecurityEvent({
            eventType: 'LOGIN_FAILED',
            severity: 'WARNING',
            userId: user.id,
            email: credentials.email,
            details: { reason: 'invalid_password' },
          }).catch(() => {})
          return null
        }

        console.log('[Contractor Credentials] User authenticated successfully:', credentials.email)
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
          userType: 'contractor',
        }
      }
    }),
    CredentialsProvider({
      id: "client-credentials",
      name: "client-credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          console.log('[Client Credentials] Missing email or password')
          return null
        }

        const clientUser = await prisma.clientUser.findUnique({
          where: {
            email: credentials.email
          },
          include: {
            client: {
              select: {
                id: true,
                name: true,
                email: true,
                userId: true, // Contractor who owns this client
              }
            }
          }
        })

        if (!clientUser) {
          console.log('[Client Credentials] Client user not found:', credentials.email)
          logSecurityEvent({
            eventType: 'LOGIN_FAILED',
            severity: 'WARNING',
            email: credentials.email,
            details: { reason: 'client_user_not_found', userType: 'client' },
          }).catch(() => {})
          return null
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          clientUser.passwordHash
        )

        if (!isPasswordValid) {
          console.log('[Client Credentials] Invalid password for client:', credentials.email)
          logSecurityEvent({
            eventType: 'LOGIN_FAILED',
            severity: 'WARNING',
            userId: clientUser.id,
            email: credentials.email,
            details: { reason: 'invalid_password', userType: 'client' },
          }).catch(() => {})
          return null
        }

        console.log('[Client Credentials] Client authenticated successfully:', credentials.email)

        // Update last login time
        await prisma.clientUser.update({
          where: { id: clientUser.id },
          data: { lastLoginAt: new Date() }
        }).catch(() => {})

        logSecurityEvent({
          eventType: 'LOGIN_SUCCESS',
          userId: clientUser.id,
          email: clientUser.email,
          details: { userType: 'client', clientId: clientUser.clientId },
        }).catch(() => {})

        return {
          id: clientUser.id,
          email: clientUser.email,
          name: clientUser.name,
          image: null,
          role: 'CLIENT',
          mustChangePassword: clientUser.mustChangePassword || false,
          organizationId: null,
          userType: 'client',
          clientId: clientUser.clientId,
          contractorId: clientUser.client.userId, // The contractor who owns this client
        }
      }
    })
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.role = user.role
        token.mustChangePassword = user.mustChangePassword || false
        token.organizationId = user.organizationId || null
        token.userType = user.userType || 'contractor'
        token.clientId = user.clientId || null
        token.contractorId = user.contractorId || null
      }
      if (account?.provider === 'google' && account.access_token) {
        token.googleAccessToken = account.access_token
        if (account.refresh_token) token.googleRefreshToken = account.refresh_token
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.sub!
        session.user.role = token.role as string
        session.user.mustChangePassword = (token.mustChangePassword as boolean) || false
        session.user.organizationId = (token.organizationId as string) || null
        session.user.userType = (token.userType as string) || 'contractor'
        session.user.clientId = (token.clientId as string) || null
        session.user.contractorId = (token.contractorId as string) || null
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
