-- Read-only preflight. Output contains account/invite identifiers and canonical
-- email; retain only in an access-controlled migration receipt.
WITH whitespace AS (
  SELECT E' \t\n\r\f\v' || chr(160) || chr(5760) ||
    chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) ||
    chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201) ||
    chr(8202) || chr(8232) || chr(8233) || chr(8239) || chr(8287) ||
    chr(12288) || chr(65279) AS chars
), user_identities AS (
  SELECT u.*, lower(normalize(btrim(u."email", w.chars), NFKC)) AS canonical_email
  FROM "User" u CROSS JOIN whitespace w
), invite_identities AS (
  SELECT i.*, lower(normalize(btrim(i."email", w.chars), NFKC)) AS canonical_email
  FROM "UserInvite" i CROSS JOIN whitespace w
), user_collisions AS (
SELECT canonical_email,
       count(*) AS identity_count,
       array_agg("id" ORDER BY "createdAt") AS identity_ids,
       'User'::text AS identity_table
FROM user_identities
GROUP BY canonical_email
HAVING count(*) > 1
), invite_variant_collisions AS (
SELECT canonical_email,
       count(*) AS identity_count,
       array_agg("id" ORDER BY "createdAt") AS identity_ids,
       'UserInvite'::text AS identity_table
FROM invite_identities
GROUP BY canonical_email
HAVING count(DISTINCT "email") > 1
)
SELECT * FROM user_collisions
UNION ALL
SELECT * FROM invite_variant_collisions
ORDER BY identity_count DESC, canonical_email;

WITH whitespace AS (
  SELECT E' \t\n\r\f\v' || chr(160) || chr(5760) ||
    chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) ||
    chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201) ||
    chr(8202) || chr(8232) || chr(8233) || chr(8239) || chr(8287) ||
    chr(12288) || chr(65279) AS chars
)
SELECT i."id" AS invite_id, u."id" AS user_id,
       lower(normalize(btrim(i."email", w.chars), NFKC)) AS canonical_email
FROM "UserInvite" i
JOIN "User" u ON true
CROSS JOIN whitespace w
WHERE lower(normalize(btrim(u."email", w.chars), NFKC)) =
      lower(normalize(btrim(i."email", w.chars), NFKC))
  AND i."usedAt" IS NULL AND i."expiresAt" > CURRENT_TIMESTAMP
ORDER BY canonical_email, invite_id;
