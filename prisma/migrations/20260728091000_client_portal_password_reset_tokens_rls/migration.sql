-- Reset codes are server-only credentials. RLS blocks Supabase anon and
-- authenticated client roles; the server-side Prisma role remains the access path.
ALTER TABLE "ClientPasswordResetToken" ENABLE ROW LEVEL SECURITY;
