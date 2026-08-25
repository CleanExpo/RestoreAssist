-- Keep the database boundary aligned with lib/email-identity.ts: trim the
-- ECMAScript whitespace set, NFKC, then lower-case. chr() avoids invisible
-- whitespace characters in this migration's source.
CREATE OR REPLACE FUNCTION restoreassist_canonical_email(value TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT lower(normalize(btrim(
    value,
    E' \t\n\r\f\v' || chr(160) || chr(5760) ||
    chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) ||
    chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201) ||
    chr(8202) || chr(8232) || chr(8233) || chr(8239) || chr(8287) ||
    chr(12288) || chr(65279)
  ), NFKC));
$$;

-- Fail closed. Existing account collisions, differently-spelled invite
-- identities, or a live invite shadowed by an account require operator review.
DO $$
DECLARE collision_count integer;
BEGIN
  SELECT count(*) INTO collision_count
  FROM (
    SELECT restoreassist_canonical_email("email")
    FROM "User"
    GROUP BY restoreassist_canonical_email("email")
    HAVING count(*) > 1
  ) collisions;

  collision_count := collision_count + (
    SELECT count(*) FROM (
      SELECT restoreassist_canonical_email("email")
      FROM "UserInvite"
      GROUP BY restoreassist_canonical_email("email")
      HAVING count(DISTINCT "email") > 1
    ) invite_variants
  );

  collision_count := collision_count + (
    SELECT count(*)
    FROM "UserInvite" i
    JOIN "User" u
      ON restoreassist_canonical_email(u."email") =
         restoreassist_canonical_email(i."email")
    WHERE i."usedAt" IS NULL AND i."expiresAt" > CURRENT_TIMESTAMP
  );

  IF collision_count > 0 THEN
    RAISE EXCEPTION
      'canonical email migration blocked: % collision group(s); run scripts/audit-email-identity-collisions.sql and resolve manually',
      collision_count;
  END IF;
END $$;

UPDATE "User" SET "email" = restoreassist_canonical_email("email")
WHERE "email" <> restoreassist_canonical_email("email");

UPDATE "UserInvite" SET "email" = restoreassist_canonical_email("email")
WHERE "email" <> restoreassist_canonical_email("email");

CREATE UNIQUE INDEX "User_email_canonical_key"
  ON "User" (restoreassist_canonical_email("email"));
CREATE INDEX "UserInvite_email_canonical_idx"
  ON "UserInvite" (restoreassist_canonical_email("email"));
