import { NextAuthOptions } from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import GoogleProvider from "next-auth/providers/google"
import CredentialsProvider from "next-auth/providers/credentials"
import { prisma } from "./prisma"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"

// Check if Google OAuth is properly configured
const hasValidGoogleOAuth =
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_CLIENT_SECRET &&
  !process.env.GOOGLE_CLIENT_ID.includes('your-google-client-id')

console.log('[Auth Config] Initializing authOptions')
console.log('[Auth Config] Has valid Google OAuth:', hasValidGoogleOAuth)

export const authOptions: NextAuthOptions = {
  // NOTE: PrismaAdapter is NOT compatible with CredentialsProvider
  // Only use adapter when Google OAuth is configured
  // For credentials provider, we manage users manually in the authorize callback
  ...(hasValidGoogleOAuth ? { adapter: PrismaAdapter(prisma) } : {}),
  providers: [
    // Only include Google provider if properly configured
    ...(hasValidGoogleOAuth ? [
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      })
    ] : []),
    CredentialsProvider({
      id: "credentials",
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        console.log('[Auth] ===== AUTHORIZE CALLBACK CALLED =====');
        try {
          if (!credentials?.email || !credentials?.password) {
            console.error('[Auth] Missing credentials');
            throw new Error('Missing email or password');
          }

          console.log('[Auth] Attempting login for:', credentials.email);

          let user;
          try {
            user = await prisma.user.findUnique({
              where: {
                email: credentials.email
              }
            });
          } catch (dbError) {
            console.error('[Auth] Database error:',  dbError);
            throw new Error('Database connection failed. Please contact support.');
          }

          if (!user) {
            console.error('[Auth] User not found:', credentials.email);
            throw new Error('Invalid email or password');
          }

          if (!user.password) {
            console.error('[Auth] User has no password:', credentials.email);
            throw new Error('Invalid email or password');
          }

          const isPasswordValid = await bcrypt.compare(
            credentials.password,
            user.password
          );

          if (!isPasswordValid) {
            console.error('[Auth] Invalid password for:', credentials.email);
            throw new Error('Invalid email or password');
          }

          console.log('[Auth] Login successful for:', credentials.email);

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
            role: user.role,
          };
        } catch (error) {
          console.error('[Auth] Authorization error:', error);
          throw error;
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
        token.id = user.id
        token.role = user.role
        token.sub = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.sub || token.id
        session.user.role = token.role as string
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
    signUp: "/signup",
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
  logger: {
    error(code, metadata) {
      console.error('[NextAuth Error]', code, metadata);
    },
    warn(code) {
      console.warn('[NextAuth Warn]', code);
    },
    debug(code, metadata) {
      console.log('[NextAuth Debug]', code, metadata);
    },
  },
}
