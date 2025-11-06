import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"

// Mock user database for testing when PostgreSQL is unreachable
const mockUsers = new Map();

// Initialize test user
const initTestUser = async () => {
  if (!mockUsers.has('test@restoreassist.com')) {
    const hashedPassword = await bcrypt.hash('Test123!', 12);
    mockUsers.set('test@restoreassist.com', {
      id: 'mock-user-1',
      email: 'test@restoreassist.com',
      name: 'Test User',
      password: hashedPassword,
      role: 'USER',
      image: null,
    });
    console.log('[Auth Mock] Test user initialized');
  }
};

// Initialize on module load
initTestUser();

console.log('[Auth Mock] Module loaded, exporting authOptions');

const credentialsProvider = CredentialsProvider({
  id: 'credentials',
  name: "credentials",
  credentials: {
    email: { label: "Email", type: "email" },
    password: { label: "Password", type: "password" }
  },
  async authorize(credentials) {
        console.log('[Auth Mock] authorize() called with:', {
          hasEmail: !!credentials?.email,
          hasPassword: !!credentials?.password,
          email: credentials?.email
        });

        try {
          if (!credentials?.email || !credentials?.password) {
            console.error('[Auth Mock] Missing credentials');
            return null; // NextAuth expects null for auth failure
          }

          console.log('[Auth Mock] Attempting login for:', credentials.email);

          const user = mockUsers.get(credentials.email);

          if (!user) {
            console.error('[Auth Mock] User not found:', credentials.email);
            return null; // NextAuth expects null for auth failure
          }

          if (!user.password) {
            console.error('[Auth Mock] User has no password:', credentials.email);
            return null;
          }

          const isPasswordValid = await bcrypt.compare(
            credentials.password,
            user.password
          );

          if (!isPasswordValid) {
            console.error('[Auth Mock] Invalid password for:', credentials.email);
            return null;
          }

          console.log('[Auth Mock] Login successful for:', credentials.email);

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
            role: user.role,
          };
        } catch (error) {
          console.error('[Auth Mock] Authorization error:', error);
          return null; // Return null instead of throwing
        }
      }
});

console.log('[Auth Mock] Credentials provider created:', {
  id: credentialsProvider.id,
  name: credentialsProvider.name,
  type: credentialsProvider.type
});

export const authOptions: NextAuthOptions = {
  providers: [credentialsProvider],
  session: {
    strategy: "jwt",
  },
  events: {
    async signIn(message) {
      console.log('[Auth Mock Event] signIn:', message);
    },
    async signOut(message) {
      console.log('[Auth Mock Event] signOut:', message);
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.sub || token.id;
        session.user.role = token.role as string;
      }
      return session;
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
