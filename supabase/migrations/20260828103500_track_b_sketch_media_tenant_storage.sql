-- Track B: replace bucket-wide authenticated sketch-media access with
-- inspection-tenant path policies. Object names must be:
-- inspections/{Inspection.id}/{underlays|photos|exports}/...

-- Production may not have received the older out-of-band bucket setup. Make
-- the migration self-contained and idempotent so the first authorised upload
-- cannot fail with "Bucket not found". The private flag and limits are also
-- repaired when the bucket already exists.
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'sketch-media',
  'sketch-media',
  false,
  10485760,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "sketch-media: public read" ON storage.objects;
DROP POLICY IF EXISTS "Public read access" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read sketch media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload sketch media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete own sketch media" ON storage.objects;
DROP POLICY IF EXISTS "sketch-media: authenticated can select" ON storage.objects;
DROP POLICY IF EXISTS "track_b_sketch_media_select" ON storage.objects;
DROP POLICY IF EXISTS "track_b_sketch_media_insert" ON storage.objects;
DROP POLICY IF EXISTS "track_b_sketch_media_update" ON storage.objects;
DROP POLICY IF EXISTS "track_b_sketch_media_delete" ON storage.objects;

CREATE POLICY "track_b_sketch_media_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'sketch-media'
    AND split_part(name, '/', 1) = 'inspections'
    AND split_part(name, '/', 3) IN ('underlays', 'photos', 'exports')
    AND EXISTS (
      SELECT 1 FROM public."Inspection" i
      WHERE i."id" = split_part(name, '/', 2)
        AND (
          i."userId" = (SELECT auth.uid())::text
          OR (
            i."workspaceId" IS NOT NULL
            AND (
              public.is_workspace_owner(i."workspaceId")
              OR public.is_workspace_member(i."workspaceId")
            )
          )
        )
    )
  );

CREATE POLICY "track_b_sketch_media_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'sketch-media'
    AND split_part(name, '/', 1) = 'inspections'
    AND split_part(name, '/', 3) IN ('photos', 'exports')
    AND split_part(name, '/', 4) <> 'verified'
    AND EXISTS (
      SELECT 1 FROM public."Inspection" i
      WHERE i."id" = split_part(name, '/', 2)
        AND (
          i."userId" = (SELECT auth.uid())::text
          OR (
            i."workspaceId" IS NOT NULL
            AND (
              public.is_workspace_owner(i."workspaceId")
              OR public.is_workspace_member(i."workspaceId")
            )
          )
        )
    )
  );

CREATE POLICY "track_b_sketch_media_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'sketch-media'
    AND split_part(name, '/', 1) = 'inspections'
    AND split_part(name, '/', 3) IN ('photos', 'exports')
    AND split_part(name, '/', 4) <> 'verified'
    AND EXISTS (
      SELECT 1 FROM public."Inspection" i
      WHERE i."id" = split_part(name, '/', 2)
        AND (
          i."userId" = (SELECT auth.uid())::text
          OR (
            i."workspaceId" IS NOT NULL
            AND (
              public.is_workspace_owner(i."workspaceId")
              OR public.is_workspace_member(i."workspaceId")
            )
          )
        )
    )
  )
  WITH CHECK (
    bucket_id = 'sketch-media'
    AND split_part(name, '/', 1) = 'inspections'
    AND split_part(name, '/', 3) IN ('photos', 'exports')
    AND split_part(name, '/', 4) <> 'verified'
    AND EXISTS (
      SELECT 1 FROM public."Inspection" i
      WHERE i."id" = split_part(name, '/', 2)
        AND (
          i."userId" = (SELECT auth.uid())::text
          OR (
            i."workspaceId" IS NOT NULL
            AND (
              public.is_workspace_owner(i."workspaceId")
              OR public.is_workspace_member(i."workspaceId")
            )
          )
        )
    )
  );

CREATE POLICY "track_b_sketch_media_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'sketch-media'
    AND split_part(name, '/', 1) = 'inspections'
    AND split_part(name, '/', 3) IN ('photos', 'exports')
    AND split_part(name, '/', 4) <> 'verified'
    AND EXISTS (
      SELECT 1 FROM public."Inspection" i
      WHERE i."id" = split_part(name, '/', 2)
        AND (
          i."userId" = (SELECT auth.uid())::text
          OR (
            i."workspaceId" IS NOT NULL
            AND public.is_workspace_owner(i."workspaceId")
          )
        )
    )
  );
